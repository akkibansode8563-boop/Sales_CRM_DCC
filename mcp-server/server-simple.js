// Simplified MCP server using JSON file storage for testing
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const path = require('path');

const PORT = 3001;
const DB_FILE = 'db.json';
const STATIC_DIR = path.join(__dirname, '..'); // Serve files from parent directory

// Load database
let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));


function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken(user) {
    return Buffer.from(JSON.stringify({
        user_id: user.id,
        username: user.username,
        role: user.role,
        exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    })).toString('base64');
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        const url = req.url;

        try {
            // Login endpoint
            if (url === '/api/auth/login' && req.method === 'POST') {
                const { username, password } = JSON.parse(body);
                const user = db.users.find(u => u.username === username);

                if (!user) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
                    return;
                }

                const hashedInput = hashPassword(password);
                if (hashedInput === user.password_hash) {
                    const token = generateToken(user);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        user_id: user.id,
                        username: user.username,
                        role: user.role,
                        full_name: user.full_name,
                        token: token
                    }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid credentials' }));
                }
                return;
            }

            // Create user endpoint
            if (url === '/api/users' && req.method === 'POST') {
                const userData = JSON.parse(body);
                const newUser = {
                    id: db.users.length + 1,
                    username: userData.username,
                    password_hash: hashPassword(userData.password),
                    full_name: userData.full_name,
                    role: userData.role,
                    email: userData.email,
                    phone: userData.phone || null,
                    created_at: new Date().toISOString()
                };

                db.users.push(newUser);
                saveDB();

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, user_id: newUser.id }));
                return;
            }

            // Get visits
            if (url.startsWith('/api/visits/') && req.method === 'GET') {
                const managerId = parseInt(url.split('/')[3]);
                const visits = db.visits.filter(v => v.manager_id === managerId);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, visits }));
                return;
            }

            // Create visit
            if (url === '/api/visits' && req.method === 'POST') {
                const visitData = JSON.parse(body);
                const newVisit = {
                    id: db.visits.length + 1,
                    ...visitData,
                    created_at: new Date().toISOString()
                };

                db.visits.push(newVisit);
                saveDB();

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, visit_id: newVisit.id }));
                return;
            }

            // Get targets
            if (url.startsWith('/api/targets/') && req.method === 'GET') {
                const managerId = parseInt(url.split('/')[3]);
                const today = new Date().toISOString().split('T')[0];
                const targets = db.targets.filter(t => t.manager_id === managerId && t.date === today);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, targets }));
                return;
            }

            // Update target achievement
            if (url.startsWith('/api/targets/') && url.includes('/achievement') && req.method === 'PUT') {
                const targetId = parseInt(url.split('/')[3]);
                const { achieved } = JSON.parse(body);

                const target = db.targets.find(t => t.id === targetId);
                if (target) {
                    target.achieved = achieved;
                    target.updated_at = new Date().toISOString();
                    saveDB();

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, target }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Target not found' }));
                }
                return;
            }

            // Update manager status
            if (url === '/api/status/update' && req.method === 'POST') {
                const { manager_id, status } = JSON.parse(body);

                const statusEntry = {
                    id: db.statusHistory.length + 1,
                    manager_id: manager_id,
                    status: status,
                    timestamp: new Date().toISOString()
                };

                db.statusHistory.push(statusEntry);
                saveDB();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: statusEntry }));
                return;
            }

            // Get current status
            if (url.startsWith('/api/status/current/') && req.method === 'GET') {
                const managerId = parseInt(url.split('/')[3]);
                const statuses = db.statusHistory.filter(s => s.manager_id === managerId);
                const currentStatus = statuses.length > 0 ? statuses[statuses.length - 1] : { status: 'In-Office' };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: currentStatus.status }));
                return;
            }

            // Create target (for admin to assign targets)
            if (url === '/api/targets' && req.method === 'POST') {
                const targetData = JSON.parse(body);
                const newTarget = {
                    id: db.targets.length + 1,
                    ...targetData,
                    achieved: targetData.achieved || 0,
                    created_at: new Date().toISOString()
                };

                db.targets.push(newTarget);
                saveDB();

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, target_id: newTarget.id }));
                return;
            }

            // Start Journey
            if (url === '/api/journey/start' && req.method === 'POST') {
                const { manager_id, start_location, latitude, longitude } = JSON.parse(body);

                // Check if there's an active journey
                const activeJourney = db.journeys.find(j =>
                    j.manager_id === manager_id && j.status === 'active'
                );

                if (activeJourney) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        message: 'Journey already active',
                        journey: activeJourney
                    }));
                    return;
                }

                const newJourney = {
                    id: db.journeys.length + 1,
                    manager_id: manager_id,
                    date: new Date().toISOString().split('T')[0],
                    start_time: new Date().toISOString(),
                    start_location: start_location,
                    start_latitude: latitude,
                    start_longitude: longitude,
                    end_time: null,
                    end_location: null,
                    end_latitude: null,
                    end_longitude: null,
                    status: 'active',
                    total_visits: 0,
                    created_at: new Date().toISOString()
                };

                db.journeys.push(newJourney);
                saveDB();

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, journey: newJourney }));
                return;
            }

            // End Journey
            if (url === '/api/journey/end' && req.method === 'POST') {
                const { manager_id, end_location, latitude, longitude } = JSON.parse(body);

                const journey = db.journeys.find(j =>
                    j.manager_id === manager_id && j.status === 'active'
                );

                if (!journey) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'No active journey found' }));
                    return;
                }

                journey.end_time = new Date().toISOString();
                journey.end_location = end_location;
                journey.end_latitude = latitude;
                journey.end_longitude = longitude;
                journey.status = 'completed';

                // Count visits for this journey
                const todayVisits = db.visits.filter(v =>
                    v.manager_id === manager_id &&
                    v.visit_date === journey.date
                );
                journey.total_visits = todayVisits.length;

                saveDB();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, journey: journey }));
                return;
            }

            // Get Active Journey
            if (url.startsWith('/api/journey/active/') && req.method === 'GET') {
                const managerId = parseInt(url.split('/')[3]);
                const activeJourney = db.journeys.find(j =>
                    j.manager_id === managerId && j.status === 'active'
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    journey: activeJourney || null,
                    isActive: !!activeJourney
                }));
                return;
            }

            // Get Today's Visit Count
            if (url.startsWith('/api/visits/today-count/') && req.method === 'GET') {
                const managerId = parseInt(url.split('/')[3]);
                const today = new Date().toISOString().split('T')[0];
                const todayVisits = db.visits.filter(v =>
                    v.manager_id === managerId && v.visit_date === today
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    count: todayVisits.length,
                    visits: todayVisits
                }));
                return;
            }


            // ===== DAILY SALES REPORTS ENDPOINTS =====

            // Submit daily sales report
            if (req.method === 'POST' && url === '/api/daily-sales-report') {
                const report = JSON.parse(body);

                // Initialize daily_sales_reports if it doesn't exist
                if (!db.daily_sales_reports) {
                    db.daily_sales_reports = [];
                }

                // Check if report already exists for this date
                const existingIndex = db.daily_sales_reports.findIndex(r =>
                    r.manager_id === report.manager_id && r.date === report.date
                );

                if (existingIndex !== -1) {
                    // Update existing report
                    const updatedReport = {
                        ...db.daily_sales_reports[existingIndex],
                        sales_target: report.sales_target,
                        sales_achievement: report.sales_achievement,
                        profit_target: report.profit_target,
                        profit_achievement: report.profit_achievement,
                        profit_percentage: ((report.profit_achievement / report.sales_achievement) * 100).toFixed(2),
                        updated_at: new Date().toISOString()
                    };

                    db.daily_sales_reports[existingIndex] = updatedReport;
                    saveDB();

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: 'Report updated successfully',
                        report: updatedReport
                    }));
                } else {
                    // Create new report
                    const newReport = {
                        id: db.daily_sales_reports.length + 1,
                        manager_id: report.manager_id,
                        date: report.date,
                        sales_target: report.sales_target,
                        sales_achievement: report.sales_achievement,
                        profit_target: report.profit_target,
                        profit_achievement: report.profit_achievement,
                        profit_percentage: ((report.profit_achievement / report.sales_achievement) * 100).toFixed(2),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    db.daily_sales_reports.push(newReport);
                    saveDB();

                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: 'Report submitted successfully',
                        report: newReport
                    }));
                }
                return;
            }

            // Get daily sales report for specific date
            if (req.method === 'GET' && url.startsWith('/api/daily-sales-report/')) {
                const parts = url.split('/');
                const managerId = parseInt(parts[3]);
                const date = parts[4];

                // Initialize daily_sales_reports if it doesn't exist
                if (!db.daily_sales_reports) {
                    db.daily_sales_reports = [];
                }

                const report = db.daily_sales_reports.find(r =>
                    r.manager_id === managerId && r.date === date
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    report: report || null
                }));
                return;
            }

            // Get all daily sales reports for a manager
            if (req.method === 'GET' && url.startsWith('/api/daily-sales-reports/')) {
                const managerId = parseInt(url.split('/')[3]);

                // Initialize daily_sales_reports if it doesn't exist
                if (!db.daily_sales_reports) {
                    db.daily_sales_reports = [];
                }

                const reports = db.daily_sales_reports
                    .filter(r => r.manager_id === managerId)
                    .sort((a, b) => new Date(b.date) - new Date(a.date));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    reports
                }));
                return;
            }

            // ===== PRODUCT DAY ENDPOINTS =====

            // Get all brands
            if (req.method === 'GET' && url === '/api/brands') {
                if (!db.brands) db.brands = [];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, brands: db.brands }));
                return;
            }

            // Get all products (optionally filter by brand)
            if (req.method === 'GET' && url.startsWith('/api/products')) {
                if (!db.products) db.products = [];
                const brandId = url.includes('?brand_id=') ? parseInt(url.split('?brand_id=')[1]) : null;

                let products = db.products;
                if (brandId) {
                    products = products.filter(p => p.brand_id === brandId);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, products }));
                return;
            }

            // Get product day entries for a manager (by month or date)
            if (req.method === 'GET' && url.startsWith('/api/product-day/')) {
                const parts = url.split('/');
                const managerId = parseInt(parts[3]);
                const dateParam = parts[4]; // Can be YYYY-MM for month or YYYY-MM-DD for date

                if (!db.product_day) db.product_day = [];

                let entries;
                if (dateParam && dateParam.length === 7) {
                    // Monthly filter (YYYY-MM format)
                    entries = db.product_day.filter(p =>
                        p.manager_id === managerId && p.date.startsWith(dateParam)
                    );
                } else if (dateParam) {
                    // Daily filter (YYYY-MM-DD format)
                    entries = db.product_day.filter(p =>
                        p.manager_id === managerId && p.date === dateParam
                    );
                } else {
                    // All entries for manager
                    entries = db.product_day.filter(p => p.manager_id === managerId);
                }

                // Sort by date descending
                entries.sort((a, b) => new Date(b.date) - new Date(a.date));

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, entries }));
                return;
            }

            // Add new product day entry
            if (req.method === 'POST' && url === '/api/product-day') {
                const entry = JSON.parse(body);
                if (!db.product_day) db.product_day = [];

                const newEntry = {
                    id: db.product_day.length + 1,
                    manager_id: entry.manager_id,
                    date: entry.date,
                    brand: entry.brand,
                    product_name: entry.product_name,
                    target_qty: entry.target_qty || 0,
                    achieved_qty: entry.achieved_qty || 0,
                    target_amount: entry.target_amount || 0,
                    achieved_amount: entry.achieved_amount || 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                db.product_day.push(newEntry);
                saveDB();

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Entry added', entry: newEntry }));
                return;
            }

            // Update product day entry
            if (req.method === 'PUT' && url.startsWith('/api/product-day/')) {
                const entryId = parseInt(url.split('/')[3]);
                const updates = JSON.parse(body);

                if (!db.product_day) db.product_day = [];

                const index = db.product_day.findIndex(p => p.id === entryId);
                if (index === -1) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Entry not found' }));
                    return;
                }

                db.product_day[index] = {
                    ...db.product_day[index],
                    achieved_qty: updates.achieved_qty !== undefined ? updates.achieved_qty : db.product_day[index].achieved_qty,
                    achieved_amount: updates.achieved_amount !== undefined ? updates.achieved_amount : db.product_day[index].achieved_amount,
                    updated_at: new Date().toISOString()
                };

                saveDB();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Entry updated', entry: db.product_day[index] }));
                return;
            }

            // Delete product day entry
            if (req.method === 'DELETE' && url.startsWith('/api/product-day/')) {
                const entryId = parseInt(url.split('/')[3]);

                if (!db.product_day) db.product_day = [];

                const index = db.product_day.findIndex(p => p.id === entryId);
                if (index === -1) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Entry not found' }));
                    return;
                }

                db.product_day.splice(index, 1);
                saveDB();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Entry deleted' }));
                return;
            }
            // ============================================
            // ADMIN DASHBOARD APIs (Phase 4C)
            // ============================================

            // GET all users (with optional role filter)
            if (url.startsWith('/api/users') && req.method === 'GET' && !url.includes('/api/users/')) {
                const urlParams = new URL(url, 'http://localhost');
                const roleFilter = urlParams.searchParams.get('role');

                let users = db.users.filter(u => u.is_active !== false); // Exclude soft-deleted
                if (roleFilter) {
                    users = users.filter(u => u.role === roleFilter);
                }

                // Remove password hashes for security
                const safeUsers = users.map(({ password_hash, ...rest }) => rest);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, users: safeUsers }));
                return;
            }

            // GET single user by ID
            if (url.match(/^\/api\/users\/\d+$/) && req.method === 'GET') {
                const userId = parseInt(url.split('/')[3]);
                const user = db.users.find(u => u.id === userId && u.is_active !== false);

                if (!user) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'User not found' }));
                    return;
                }

                const { password_hash, ...safeUser } = user;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, user: safeUser }));
                return;
            }

            // UPDATE user by ID
            if (url.match(/^\/api\/users\/\d+$/) && req.method === 'PUT') {
                const userId = parseInt(url.split('/')[3]);
                const updates = JSON.parse(body);

                const userIndex = db.users.findIndex(u => u.id === userId);
                if (userIndex === -1) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'User not found' }));
                    return;
                }

                // Update allowed fields
                const allowedFields = ['full_name', 'email', 'phone', 'territory', 'role'];
                allowedFields.forEach(field => {
                    if (updates[field] !== undefined) {
                        db.users[userIndex][field] = updates[field];
                    }
                });

                // Handle password update separately
                if (updates.password) {
                    db.users[userIndex].password_hash = hashPassword(updates.password);
                }

                db.users[userIndex].updated_at = new Date().toISOString();
                saveDB();

                const { password_hash, ...safeUser } = db.users[userIndex];
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, user: safeUser }));
                return;
            }

            // DELETE user by ID (soft delete)
            if (url.match(/^\/api\/users\/\d+$/) && req.method === 'DELETE') {
                const userId = parseInt(url.split('/')[3]);

                const userIndex = db.users.findIndex(u => u.id === userId);
                if (userIndex === -1) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'User not found' }));
                    return;
                }

                // Soft delete - mark as inactive
                db.users[userIndex].is_active = false;
                db.users[userIndex].deleted_at = new Date().toISOString();
                saveDB();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'User deleted' }));
                return;
            }

            // GET live status of all managers
            if (url === '/api/live/status' && req.method === 'GET') {
                const managers = db.users.filter(u => u.role === 'Sales Manager' && u.is_active !== false);

                const liveStatus = managers.map(manager => {
                    // Get latest status
                    const statuses = db.statusHistory.filter(s => s.manager_id === manager.id);
                    const currentStatus = statuses.length > 0 ? statuses[statuses.length - 1] : null;

                    // Get today's visits
                    const today = new Date().toISOString().split('T')[0];
                    const todayVisits = db.visits.filter(v =>
                        v.manager_id === manager.id && v.visit_date === today
                    );
                    const lastVisit = todayVisits.length > 0 ? todayVisits[todayVisits.length - 1] : null;

                    // Check for active journey
                    const activeJourney = db.journeys?.find(j =>
                        j.manager_id === manager.id &&
                        j.start_time && !j.end_time
                    );

                    return {
                        id: manager.id,
                        name: manager.full_name,
                        username: manager.username,
                        territory: manager.territory || 'Unassigned',
                        status: currentStatus?.status || 'In-Office',
                        last_update: currentStatus?.timestamp || null,
                        visits_today: todayVisits.length,
                        last_location: lastVisit ? {
                            name: lastVisit.location,
                            lat: lastVisit.latitude,
                            lng: lastVisit.longitude,
                            time: lastVisit.created_at
                        } : null,
                        active_journey: activeJourney ? {
                            started_at: activeJourney.start_time,
                            visit_count: activeJourney.visit_count || 0
                        } : null
                    };
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, managers: liveStatus }));
                return;
            }

            // GET all active journeys
            if (url === '/api/journeys/active' && req.method === 'GET') {
                if (!db.journeys) db.journeys = [];

                const activeJourneys = db.journeys.filter(j => j.start_time && !j.end_time);

                // Enrich with manager info
                const enriched = activeJourneys.map(journey => {
                    const manager = db.users.find(u => u.id === journey.manager_id);
                    const today = new Date().toISOString().split('T')[0];
                    const todayVisits = db.visits.filter(v =>
                        v.manager_id === journey.manager_id && v.visit_date === today
                    );

                    return {
                        ...journey,
                        manager_name: manager?.full_name || 'Unknown',
                        visits: todayVisits
                    };
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, journeys: enriched }));
                return;
            }

            // POST bulk targets
            if (url === '/api/targets/bulk' && req.method === 'POST') {
                const { manager_ids, visit_target, sales_target, month, year } = JSON.parse(body);

                if (!manager_ids || !Array.isArray(manager_ids) || manager_ids.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'manager_ids array required' }));
                    return;
                }

                const createdTargets = [];
                const targetMonth = month || new Date().getMonth() + 1;
                const targetYear = year || new Date().getFullYear();

                manager_ids.forEach(managerId => {
                    const newTarget = {
                        id: db.targets.length + 1 + createdTargets.length,
                        manager_id: managerId,
                        visit_target: visit_target || 0,
                        sales_target: sales_target || 0,
                        month: targetMonth,
                        year: targetYear,
                        date: `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`,
                        achieved: 0,
                        created_at: new Date().toISOString()
                    };
                    createdTargets.push(newTarget);
                });

                db.targets.push(...createdTargets);
                saveDB();

                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: `Created ${createdTargets.length} targets`,
                    targets: createdTargets
                }));
                return;
            }

            // Static file serving - serve HTML, CSS, JS, images from parent directory
            const mimeTypes = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            };

            // Handle root path
            let filePath = url === '/' ? '/login.html' : url;

            // Remove query strings
            filePath = filePath.split('?')[0];

            // Decode URL to handle spaces and special characters
            try {
                filePath = decodeURIComponent(filePath);
            } catch (e) {
                console.error('Error decoding path:', e);
            }

            const fullPath = path.join(STATIC_DIR, filePath);
            const ext = path.extname(fullPath).toLowerCase();
            const mimeType = mimeTypes[ext];

            // Only serve known file types
            if (mimeType && fs.existsSync(fullPath)) {
                try {
                    const content = fs.readFileSync(fullPath);
                    res.writeHead(200, { 'Content-Type': mimeType });
                    res.end(content);
                    return;
                } catch (readError) {
                    console.error('Error reading file:', readError);
                }
            }

            // Default 404
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));


        } catch (error) {
            console.error('Error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n✅ Sales CRM API Server running on http://localhost:${PORT}`);
    console.log(`📁 Database: ${DB_FILE}`);
    console.log('\nEndpoints available:');
    console.log('  POST /api/auth/login - User authentication');
    console.log('  POST /api/users - Create new user');
    console.log('  GET  /api/visits/:managerId - Get visits');
    console.log('  POST /api/visits - Create visit');
    console.log('  GET  /api/targets/:managerId - Get today\'s targets');
    console.log('  POST /api/targets - Create target (admin)');
    console.log('  PUT  /api/targets/:id/achievement - Update achievement');
    console.log('  POST /api/status/update - Update manager status');
    console.log('  GET  /api/status/current/:managerId - Get current status');
    console.log('\nReady to accept requests!\n');
});
