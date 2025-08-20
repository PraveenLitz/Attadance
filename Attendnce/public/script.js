document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let currentDate = new Date();
    let employees = [];
    let officeLeaves = {}; // { 'YYYY-MM-DD': 'Description' }
    let attendanceData = {}; // { 'YYYY-MM-DD': { employee_id: {status, intime, notes} } }

    // --- DOM ELEMENTS ---
    const calendarGrid = document.querySelector('.calendar-grid');
    const calendarHeader = document.getElementById('calendar-header');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const addEmployeeBtn = document.getElementById('add-employee-btn');
    const newEmployeeNameInput = document.getElementById('new-employee-name');
    const reportEmployeeFilter = document.getElementById('report-employee-filter');
    const reportMonthFilter = document.getElementById('report-month-filter');
    const generateReportBtn = document.getElementById('generate-report-btn');
    const reportOutput = document.getElementById('report-output');
    const summaryHeader = document.getElementById('summary-header');
    const monthlySummaryList = document.getElementById('monthly-summary-list');
    const addLeaveBtn = document.getElementById('add-leave-btn');
    const newLeaveDateInput = document.getElementById('new-leave-date');
    const newLeaveDescInput = document.getElementById('new-leave-desc');
    const officeLeavesList = document.getElementById('office-leaves-list');
    
    const attendanceModal = new bootstrap.Modal(document.getElementById('attendance-modal'));
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const saveAttendanceBtn = document.getElementById('save-attendance-btn');
    let selectedDateForModal = '';

    // --- API FUNCTIONS ---
    async function fetchEmployees() {
        try {
            const response = await fetch('/api/employees');
            employees = await response.json();
            populateEmployeeFilter();
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        }
    }

    async function fetchAttendance(year, month) {
        try {
            const response = await fetch(`/api/attendance?year=${year}&month=${month}`);
            const data = await response.json();
            attendanceData = {}; // Reset for the new month
            data.forEach(rec => {
                if (!attendanceData[rec.date]) {
                    attendanceData[rec.date] = {};
                }
                // Store the full record object
                attendanceData[rec.date][rec.employee_id] = { 
                    status: rec.status, 
                    intime: rec.intime, 
                    notes: rec.notes 
                };
            });
        } catch (error) {
            console.error('Failed to fetch attendance:', error);
        }
    }

    async function addEmployee() {
        // Unchanged from original...
        const name = newEmployeeNameInput.value.trim();
        if (!name) return alert('Please enter an employee name.');
        try {
            const response = await fetch('/api/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (response.ok) {
                newEmployeeNameInput.value = '';
                await fetchEmployees();
                await renderCalendar();
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.error}`);
            }
        } catch (error) {
            alert('An error occurred while adding the employee.');
        }
    }

    async function deleteEmployee(employeeId, employeeName) {
        // Unchanged from original...
        if (!confirm(`Are you sure you want to delete ${employeeName}? This action will also remove all their attendance records and cannot be undone.`)) return;
        try {
            const response = await fetch(`/api/employees/${employeeId}`, { method: 'DELETE' });
            if (response.ok) {
                await fetchEmployees();
                await renderCalendar();
            } else {
                const errorData = await response.json();
                alert(`Error deleting employee: ${errorData.message || 'Unknown error'}`);
            }
        } catch (error) {
            alert('A network error occurred while deleting the employee.');
        }
    }

    async function saveAttendance() {
        const records = [];
        const employeeRows = modalBody.querySelectorAll('.employee-attendance-row');
        employeeRows.forEach(row => {
            const employeeId = row.dataset.employeeId;
            const status = row.querySelector('input[type="radio"]:checked').value;
            const intime = row.querySelector('.intime-input').value;
            const notes = row.querySelector('.notes-input').value;

            records.push({ 
                employee_id: parseInt(employeeId), 
                status,
                intime: status === 'present' ? intime : null,
                notes: status === 'permission' ? notes : null,
            });
        });

        await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: selectedDateForModal, records }),
        });
        
        attendanceModal.hide();
        await renderCalendar();
    }
    
    // --- NEW: OFFICE LEAVE API FUNCTIONS ---
    async function fetchOfficeLeaves() {
        try {
            const response = await fetch('/api/leaves');
            const leaves = await response.json();
            officeLeaves = {};
            leaves.forEach(leave => {
                officeLeaves[leave.date] = leave.description;
            });
            renderOfficeLeaves();
        } catch (error) {
            console.error('Failed to fetch office leaves:', error);
        }
    }

    async function addOfficeLeave() {
        const date = newLeaveDateInput.value;
        const description = newLeaveDescInput.value.trim();
        if (!date || !description) return alert('Please provide both a date and description for the leave.');

        try {
            const response = await fetch('/api/leaves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, description }),
            });
            if (response.ok) {
                newLeaveDateInput.value = '';
                newLeaveDescInput.value = '';
                await fetchOfficeLeaves();
                await renderCalendar(); // Re-render calendar to show leave day
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.error}`);
            }
        } catch (error) {
            alert('An error occurred while adding the leave.');
        }
    }

    async function deleteOfficeLeave(date) {
        if (!confirm(`Are you sure you want to delete the leave on ${date}?`)) return;
        try {
            const response = await fetch(`/api/leaves/${date}`, { method: 'DELETE' });
            if (response.ok) {
                await fetchOfficeLeaves();
                await renderCalendar();
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.message}`);
            }
        } catch (error) {
            alert('A network error occurred while deleting the leave.');
        }
    }

    // --- RENDER FUNCTIONS ---
    function renderOfficeLeaves() {
        officeLeavesList.innerHTML = '';
        if (Object.keys(officeLeaves).length === 0) {
            officeLeavesList.innerHTML = '<li class="list-group-item text-muted">No office leaves defined.</li>';
            return;
        }
        Object.entries(officeLeaves).forEach(([date, description]) => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <div>
                    <span class="fw-bold">${date}</span>
                    <small class="d-block text-muted">${description}</small>
                </div>
                <button class="btn btn-sm btn-outline-danger delete-leave-btn" data-date="${date}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
            officeLeavesList.appendChild(li);
        });
    }

    function updateMonthlySummary() {
        // ... (This function is updated to count new statuses)
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const monthName = currentDate.toLocaleString('default', { month: 'long' });
        
        summaryHeader.textContent = `Summary for ${monthName}`;
        monthlySummaryList.innerHTML = '';

        if (employees.length === 0) {
            monthlySummaryList.innerHTML = '<p class="text-muted text-center">Add an employee to see the summary.</p>';
            return;
        }

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        employees.forEach(emp => {
            const counts = { present: 0, absent: 0, permission: 0, leave: 0 };

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                if (officeLeaves[dateStr]) {
                    counts.leave++;
                } else if (attendanceData[dateStr] && attendanceData[dateStr][emp.id]) {
                    const status = attendanceData[dateStr][emp.id].status;
                    if (counts.hasOwnProperty(status)) {
                        counts[status]++;
                    }
                }
            }
            
            const totalRecordedDays = counts.present + counts.absent + counts.permission;
            const presentPercentage = totalRecordedDays > 0 ? (counts.present / totalRecordedDays) * 100 : 0;
            
            const summaryHTML = `
                <div class="employee-summary">
                    <div class="summary-header">
                        <span class="name">${emp.name}</span>
                        <button class="delete-employee-btn" data-employee-id="${emp.id}" data-employee-name="${emp.name}" title="Delete Employee">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                    <div class="progress" style="height: 10px;">
                        <div class="progress-bar bg-success" role="progressbar" style="width: ${presentPercentage}%"></div>
                    </div>
                    <div class="stats mt-2 d-flex justify-content-around">
                        <span><strong class="text-success">${counts.present}</strong> P</span>
                        <span><strong class="text-danger">${counts.absent}</strong> A</span>
                        <span><strong class="text-info">${counts.permission}</strong> P<small>erm</small></span>
                        <span><strong class="text-secondary">${counts.leave}</strong> L</span>
                    </div>
                </div>
            `;
            monthlySummaryList.innerHTML += summaryHTML;
        });
    }
    
    async function renderCalendar() {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        await fetchAttendance(year, month + 1);

        calendarHeader.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;
        calendarGrid.innerHTML = `
            <div class="calendar-header">Sun</div><div class="calendar-header">Mon</div><div class="calendar-header">Tue</div>
            <div class="calendar-header">Wed</div><div class="calendar-header">Thu</div><div class="calendar-header">Fri</div>
            <div class="calendar-header">Sat</div>`;

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const firstDayOfWeek = firstDayOfMonth.getDay();
        const totalDays = lastDayOfMonth.getDate();

        for (let i = 0; i < firstDayOfWeek; i++) {
            calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day other-month"></div>');
        }

        for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const today = new Date();
            const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
            const isLeaveDay = !!officeLeaves[dateStr];

            let summaryHTML = '';
            const counts = { present: 0, absent: 0, permission: 0 };

            if (attendanceData[dateStr]) {
                Object.values(attendanceData[dateStr]).forEach(record => {
                    if (counts.hasOwnProperty(record.status)) {
                        counts[record.status]++;
                    }
                });
            }

            if (counts.present > 0) summaryHTML += `<div class="summary-item"><span class="dot present-dot"></span>${counts.present}</div>`;
            if (counts.absent > 0) summaryHTML += `<div class="summary-item"><span class="dot absent-dot"></span>${counts.absent}</div>`;
            if (counts.permission > 0) summaryHTML += `<div class="summary-item"><span class="dot permission-dot"></span>${counts.permission}</div>`;
            
            const dayCellHTML = `
                <div class="calendar-day ${isToday ? 'today' : ''} ${isLeaveDay ? 'leave-day' : ''}" data-date="${dateStr}" title="${isLeaveDay ? officeLeaves[dateStr] : ''}">
                    <div class="day-number">${day}</div>
                    <div class="attendance-summary">${summaryHTML}</div>
                </div>`;
            calendarGrid.insertAdjacentHTML('beforeend', dayCellHTML);
        }
        
        updateMonthlySummary();
    }

    function openAttendanceModal(dateStr) {
        if (officeLeaves[dateStr]) {
             alert(`This day (${dateStr}) is marked as an office leave: ${officeLeaves[dateStr]}. Attendance cannot be marked.`);
             return;
        }
        selectedDateForModal = dateStr;
        const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        modalTitle.textContent = `Attendance for ${formattedDate}`;
        modalBody.innerHTML = '';

        if (employees.length === 0) {
            modalBody.innerHTML = '<p>No employees found. Please add an employee first.</p>';
            saveAttendanceBtn.disabled = true;
            return;
        }
        saveAttendanceBtn.disabled = false;
        
        const dayAttendance = attendanceData[dateStr] || {};

        employees.forEach(emp => {
            const record = dayAttendance[emp.id] || { status: 'present', intime: '09:00', notes: '' };
            const row = document.createElement('div');
            row.className = 'employee-attendance-row border rounded p-3 mb-3';
            row.dataset.employeeId = emp.id;
            
            row.innerHTML = `
                <div class="row align-items-center">
                    <div class="col-md-3 fw-bold">${emp.name}</div>
                    <div class="col-md-9">
                        <div class="d-flex flex-wrap gap-3">
                            <div class="form-check">
                                <input class="form-check-input status-radio" type="radio" name="status-${emp.id}" value="present" ${record.status === 'present' ? 'checked' : ''}>
                                <label class="form-check-label">Present</label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input status-radio" type="radio" name="status-${emp.id}" value="permission" ${record.status === 'permission' ? 'checked' : ''}>
                                <label class="form-check-label">Permission</label>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input status-radio" type="radio" name="status-${emp.id}" value="absent" ${record.status === 'absent' ? 'checked' : ''}>
                                <label class="form-check-label">Absent</label>
                            </div>
                        </div>
                        <div class="mt-2">
                            <input type="time" class="form-control form-control-sm intime-input" value="${record.intime || '09:00'}" style="display: ${record.status === 'present' ? 'block' : 'none'};">
                            <textarea class="form-control form-control-sm notes-input" placeholder="Reason for permission..." style="display: ${record.status === 'permission' ? 'block' : 'none'};">${record.notes || ''}</textarea>
                        </div>
                    </div>
                </div>
            `;
            modalBody.appendChild(row);
        });

        // Add event listeners to radio buttons to show/hide extra fields
        modalBody.querySelectorAll('.status-radio').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const parentRow = e.target.closest('.employee-attendance-row');
                const intimeInput = parentRow.querySelector('.intime-input');
                const notesInput = parentRow.querySelector('.notes-input');
                intimeInput.style.display = 'none';
                notesInput.style.display = 'none';
                if (e.target.value === 'present') {
                    intimeInput.style.display = 'block';
                } else if (e.target.value === 'permission') {
                    notesInput.style.display = 'block';
                }
            });
        });

        attendanceModal.show();
    }

    function populateEmployeeFilter() {
        // Unchanged from original...
        reportEmployeeFilter.innerHTML = '<option value="all">All Employees</option>';
        employees.forEach(emp => {
            reportEmployeeFilter.innerHTML += `<option value="${emp.id}">${emp.name}</option>`;
        });
    }

    async function generateReport() {
        // ... (This function is updated to count new statuses)
        const employeeId = reportEmployeeFilter.value;
        const monthValue = reportMonthFilter.value;
        if (!monthValue) return alert('Please select a month for the report.');
        const [year, month] = monthValue.split('-');
        
        const response = await fetch(`/api/attendance?year=${year}&month=${month}${employeeId !== 'all' ? '&employee_id=' + employeeId : ''}`);
        const data = await response.json();
        
        reportOutput.innerHTML = '';
        if (data.length === 0) {
            reportOutput.innerHTML = '<p class="text-muted">No attendance data found for this period.</p>';
            return;
        }
        
        const reportByEmployee = {};
        data.forEach(rec => {
            if (!reportByEmployee[rec.name]) {
                reportByEmployee[rec.name] = { present: 0, absent: 0, permission: 0 };
            }
            if (reportByEmployee[rec.name].hasOwnProperty(rec.status)) {
                reportByEmployee[rec.name][rec.status]++;
            }
        });
        
        let html = '<table class="table table-sm table-bordered"><thead><tr><th>Employee</th><th>Present</th><th>Absent</th><th>Permission</th></tr></thead><tbody>';
        for (const [name, counts] of Object.entries(reportByEmployee)) {
            html += `
                <tr>
                    <td>${name}</td>
                    <td><span class="badge bg-success">${counts.present}</span></td>
                    <td><span class="badge bg-danger">${counts.absent}</span></td>
                    <td><span class="badge bg-info">${counts.permission}</span></td>
                </tr>
            `;
        }
        html += '</tbody></table>';
        reportOutput.innerHTML = html;
    }

    // --- EVENT LISTENERS ---
    prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
    nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
    addEmployeeBtn.addEventListener('click', addEmployee);
    newEmployeeNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addEmployee(); });
    saveAttendanceBtn.addEventListener('click', saveAttendance);
    generateReportBtn.addEventListener('click', generateReport);
    addLeaveBtn.addEventListener('click', addOfficeLeave);

    calendarGrid.addEventListener('click', (e) => {
        const dayCell = e.target.closest('.calendar-day:not(.other-month)');
        if (dayCell) openAttendanceModal(dayCell.dataset.date);
    });

    monthlySummaryList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-employee-btn');
        if (deleteBtn) {
            const { employeeId, employeeName } = deleteBtn.dataset;
            deleteEmployee(employeeId, employeeName);
        }
    });

    officeLeavesList.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-leave-btn');
        if (deleteBtn) {
            deleteOfficeLeave(deleteBtn.dataset.date);
        }
    });

    // --- INITIALIZATION ---
    async function init() {
        const now = new Date();
        reportMonthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        await fetchEmployees();
        await fetchOfficeLeaves(); // Fetch leaves on load
        await renderCalendar();
    }
    
    init();
});