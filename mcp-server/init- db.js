import Database from 'better-sqlite3'
import bcrypt from 'bcrypt'

const db = new Database('crm_database.db')

console.log('Initializing database schema...')

// Create Users Table
db.exec(`
  CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Sales Manager', 'Admin')),
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );
`)

// Create Visits Table
db.exec(`
  CREATE TABLE IF NOT EXISTS Visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manager_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    time_in DATETIME NOT NULL,
    time_out DATETIME,
    mom TEXT,
    latitude REAL,
    longitude REAL,
    status TEXT NOT NULL CHECK(status IN ('In-Office', 'Out-of-Office')),
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES Users(id) ON DELETE CASCADE
  );
`)

db.exec('CREATE INDEX IF NOT EXISTS idx_visits_manager_date ON Visits(manager_id, date);')

// Create Targets Table
db.exec(`
  CREATE TABLE IF NOT EXISTS Targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manager_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    target_quantity INTEGER NOT NULL,
    achievement INTEGER DEFAULT 0,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES Users(id) ON DELETE CASCADE,
    UNIQUE(manager_id, product_name, date)
  );
`)

// Create StatusHistory Table
db.exec(`
  CREATE TABLE IF NOT EXISTS StatusHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manager_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('In-Office', 'Out-of-Office')),
    latitude REAL,
    longitude REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES Users(id) ON DELETE CASCADE
  );
`)

// Create ActivityLogs Table
db.exec(`
  CREATE TABLE IF NOT EXISTS ActivityLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
  );
`)

db.exec('CREATE INDEX IF NOT EXISTS idx_logs_user_timestamp ON ActivityLogs(user_id, timestamp);')

console.log('Database schema created successfully!')

// Add seed data
console.log('Adding seed data...')

const hashedAdminPass = bcrypt.hashSync('Admin@123', 10)
const hashedManagerPass = bcrypt.hashSync('Manager@123', 10)

// Insert Admin
const insertAdmin = db.prepare(`
  INSERT OR IGNORE INTO Users (username, password_hash, full_name, role, email)
  VALUES (?, ?, ?, ?, ?)
`)

insertAdmin.run('admin', hashedAdminPass, 'System Administrator', 'Admin', 'admin@salescrm.com')

// Insert Sample Managers
insertAdmin.run('john_doe', hashedManagerPass, 'John Doe', 'Sales Manager', 'john@salescrm.com')
insertAdmin.run('jane_smith', hashedManagerPass, 'Jane Smith', 'Sales Manager', 'jane@salescrm.com')

console.log('Seed data added successfully!')
console.log('')
console.log('==============================================')
console.log('Default credentials:')
console.log('Admin - Username: admin, Password: Admin@123')
console.log('Manager - Username: john_doe, Password: Manager@123')
console.log('Manager - Username: jane_smith, Password: Manager@123')
console.log('==============================================')

db.close()
