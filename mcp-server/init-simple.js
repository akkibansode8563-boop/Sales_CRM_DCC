// Simplified database initialization without npm dependencies
const fs = require('fs');
const crypto = require('crypto');

console.log('Creating database file...');

// Create a simple JSON-based storage for testing
const initialData = {
    users: [
        {
            id: 1,
            username: 'admin',
            password_hash: hashPassword('Admin@123'),
            full_name: 'System Administrator',
            role: 'Admin',
            email: 'admin@salescrm.com',
            created_at: new Date().toISOString()
        },
        {
            id: 2,
            username: 'john_doe',
            password_hash: hashPassword('Manager@123'),
            full_name: 'John Doe',
            role: 'Sales Manager',
            email: 'john@salescrm.com',
            created_at: new Date().toISOString()
        },
        {
            id: 3,
            username: 'jane_smith',
            password_hash: hashPassword('Manager@123'),
            full_name: 'Jane Smith',
            role: 'Sales Manager',
            email: 'jane@salescrm.com',
            created_at: new Date().toISOString()
        }
    ],
    visits: [
        {
            id: 1,
            manager_id: 2,
            client_name: "Tech Solutions Pvt Ltd",
            client_type: "Retailer",
            location: "Andheri West, Mumbai",
            latitude: 19.1136,
            longitude: 72.8697,
            visit_type: "Field Visit",
            notes: "Initial product demo completed",
            visit_date: new Date().toISOString().split('T')[0],
            created_at: new Date(new Date().setHours(9, 30, 0)).toISOString()
        },
        {
            id: 2,
            manager_id: 2,
            client_name: "Global Traders",
            client_type: "Distributor",
            location: "Bandra East, Mumbai",
            latitude: 19.0596,
            longitude: 72.8656,
            visit_type: "Field Visit",
            notes: "Discussed bulk order pricing",
            visit_date: new Date().toISOString().split('T')[0],
            created_at: new Date(new Date().setHours(11, 15, 0)).toISOString()
        },
        {
            id: 3,
            manager_id: 2,
            client_name: "Metro Wholesale",
            client_type: "Wholesaler",
            location: "Lower Parel, Mumbai",
            latitude: 19.0000,
            longitude: 72.8300,
            visit_type: "Field Visit",
            notes: "Quarterly review meeting",
            visit_date: new Date().toISOString().split('T')[0],
            created_at: new Date(new Date().setHours(14, 0, 0)).toISOString()
        },
        {
            id: 4,
            manager_id: 3,
            client_name: "Prime Distributors",
            client_type: "Distributor",
            location: "Powai, Mumbai",
            latitude: 19.1176,
            longitude: 72.9060,
            visit_type: "Field Visit",
            notes: "New product launch discussion",
            visit_date: new Date().toISOString().split('T')[0],
            created_at: new Date(new Date().setHours(10, 0, 0)).toISOString()
        }
    ],
    targets: [
        {
            id: 1,
            manager_id: 2,
            date: new Date().toISOString().split('T')[0],
            product: 'Product A',
            target_quantity: 100,
            achieved: 45,
            created_at: new Date().toISOString()
        },
        {
            id: 2,
            manager_id: 2,
            date: new Date().toISOString().split('T')[0],
            product: 'Product B',
            target_quantity: 50,
            achieved: 30,
            created_at: new Date().toISOString()
        },
        {
            id: 3,
            manager_id: 2,
            date: new Date().toISOString().split('T')[0],
            product: 'Product C',
            target_quantity: 75,
            achieved: 65,
            created_at: new Date().toISOString()
        },
        {
            id: 4,
            manager_id: 3,
            date: new Date().toISOString().split('T')[0],
            product: 'Product A',
            target_quantity: 80,
            achieved: 55,
            created_at: new Date().toISOString()
        },
        {
            id: 5,
            manager_id: 3,
            date: new Date().toISOString().split('T')[0],
            product: 'Product B',
            target_quantity: 60,
            achieved: 40,
            created_at: new Date().toISOString()
        }
    ],
    statusHistory: [],
    activityLogs: [],
    journeys: [],
    daily_sales_reports: [],
    brands: [
        { id: 1, name: 'Brand A' },
        { id: 2, name: 'Brand B' },
        { id: 3, name: 'Brand C' }
    ],
    products: [
        { id: 1, brand_id: 1, name: 'Product A1' },
        { id: 2, brand_id: 1, name: 'Product A2' },
        { id: 3, brand_id: 2, name: 'Product B1' },
        { id: 4, brand_id: 2, name: 'Product B2' },
        { id: 5, brand_id: 3, name: 'Product C1' }
    ],
    product_day: []
};

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

try {
    fs.writeFileSync('db.json', JSON.stringify(initialData, null, 2));

    console.log('\n✅ Database initialized successfully!');
    console.log('📁 Created: db.json');
    console.log('\n==============================================');
    console.log('Default credentials:');
    console.log('Admin - Username: admin, Password: Admin@123');
    console.log('Manager - Username: john_doe, Password: Manager@123');
    console.log('Manager - Username: jane_smith, Password: Manager@123');
    console.log('==============================================\n');
} catch (error) {
    console.error('Error creating database:', error);
    process.exit(1);
}
