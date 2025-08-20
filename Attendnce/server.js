const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

// Middleware to parse JSON bodies and serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
const db = new sqlite3.Database('./attendance.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the attendance database.');
});

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )`);

    // UPDATED attendance table schema
    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER,
        date TEXT NOT NULL,
        status TEXT NOT NULL, -- "present", "absent", "permission", "leave"
        intime TEXT,          -- HH:MM format, only for "present"
        notes TEXT,           -- For "permission" notes
        UNIQUE(employee_id, date),
        FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
    )`);

    // NEW table for office-wide leaves/holidays
    db.run(`CREATE TABLE IF NOT EXISTS office_leaves (
        date TEXT PRIMARY KEY,
        description TEXT NOT NULL
    )`);
});

// --- API ENDPOINTS ---

// GET all employees
app.get('/api/employees', (req, res) => {
    db.all("SELECT * FROM employees ORDER BY name", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// ADD a new employee
app.post('/api/employees', (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: "Employee name is required" });
    }
    db.run(`INSERT INTO employees (name) VALUES (?)`, [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: "An employee with this name already exists." });
            }
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({ id: this.lastID, name });
    });
});

// DELETE an employee
app.delete('/api/employees/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM employees WHERE id = ?`, id, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ message: "Employee not found" });
        } else {
            res.json({ message: "Employee deleted successfully", id: id });
        }
    });
});


// GET attendance data (with filtering) - UPDATED
app.get('/api/attendance', (req, res) => {
    const { month, year, employee_id } = req.query;
    if (!month || !year) {
        return res.status(400).json({ error: "Month and year are required" });
    }

    const datePrefix = `${year}-${String(month).padStart(2, '0')}-`;
    // UPDATED query to select new columns
    let query = `
        SELECT a.date, a.status, a.intime, a.notes, e.name, e.id as employee_id
        FROM attendance a
        JOIN employees e ON a.employee_id = e.id
        WHERE a.date LIKE ?
    `;
    const params = [datePrefix + '%'];

    if (employee_id && employee_id !== 'all') {
        query += " AND a.employee_id = ?";
        params.push(employee_id);
    }

    query += " ORDER BY e.name, a.date";

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// SAVE attendance data for a specific day - UPDATED
app.post('/api/attendance', (req, res) => {
    const { date, records } = req.body; // records is an array of { employee_id, status, intime, notes }
    if (!date || !records) {
        return res.status(400).json({ error: "Date and records are required" });
    }

    db.serialize(() => {
        // UPDATED statement to include new fields
        const stmt = db.prepare("INSERT OR REPLACE INTO attendance (employee_id, date, status, intime, notes) VALUES (?, ?, ?, ?, ?)");
        records.forEach(record => {
            // Use null for optional fields if they are not provided
            stmt.run(record.employee_id, date, record.status, record.intime || null, record.notes || null);
        });
        stmt.finalize((err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.status(200).json({ message: "Attendance saved successfully" });
        });
    });
});

// --- NEW: API ENDPOINTS for OFFICE LEAVES ---

// GET all office leaves
app.get('/api/leaves', (req, res) => {
    db.all("SELECT * FROM office_leaves ORDER BY date", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// ADD a new office leave
app.post('/api/leaves', (req, res) => {
    const { date, description } = req.body;
    if (!date || !description) {
        return res.status(400).json({ error: "Date and description are required" });
    }
    db.run(`INSERT INTO office_leaves (date, description) VALUES (?, ?)`, [date, description], function(err) {
        if (err) {
             if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(409).json({ error: "A leave for this date already exists." });
            }
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({ date, description });
    });
});

// DELETE an office leave
app.delete('/api/leaves/:date', (req, res) => {
    const { date } = req.params;
    db.run(`DELETE FROM office_leaves WHERE date = ?`, date, function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ message: "Leave not found for this date" });
        } else {
            res.json({ message: "Leave deleted successfully", date });
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});