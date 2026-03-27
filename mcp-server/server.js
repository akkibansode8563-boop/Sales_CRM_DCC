import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import Database from 'better-sqlite3'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
const db = new Database('crm_database.db')

// Initialize MCP Server
const server = new Server(
    {
        name: 'sales-crm-server',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
)

// Tool Definitions
server.setRequestHandler('tools/list', async () => {
    return {
        tools: [
            {
                name: 'authenticate_user',
                description: 'Authenticate user with username and password',
                inputSchema: {
                    type: 'object',
                    properties: {
                        username: { type: 'string' },
                        password: { type: 'string' },
                    },
                    required: ['username', 'password'],
                },
            },
            {
                name: 'create_user',
                description: 'Create a new Sales Manager or Admin user account (Admin only)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        username: { type: 'string' },
                        password: { type: 'string' },
                        full_name: { type: 'string' },
                        role: { type: 'string', enum: ['Sales Manager', 'Admin'] },
                        email: { type: 'string' },
                        phone: { type: 'string' },
                    },
                    required: ['username', 'password', 'full_name', 'role', 'email'],
                },
            },
            {
                name: 'get_user_by_id',
                description: 'Retrieve user details by user ID',
                inputSchema: {
                    type: 'object',
                    properties: {
                        user_id: { type: 'integer' },
                    },
                    required: ['user_id'],
                },
            },
            {
                name: 'list_all_users',
                description: 'List all users (Admin only)',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'create_visit',
                description: 'Log a new client visit',
                inputSchema: {
                    type: 'object',
                    properties: {
                        manager_id: { type: 'integer' },
                        customer_name: { type: 'string' },
                        time_in: { type: 'string' },
                        time_out: { type: 'string' },
                        mom: { type: 'string' },
                        latitude: { type: 'number' },
                        longitude: { type: 'number' },
                        status: { type: 'string', enum: ['In-Office', 'Out-of-Office'] },
                    },
                    required: ['manager_id', 'customer_name', 'time_in', 'status'],
                },
            },
            {
                name: 'get_visits_by_manager',
                description: 'Retrieve all visits for a specific manager and optional date range',
                inputSchema: {
                    type: 'object',
                    properties: {
                        manager_id: { type: 'integer' },
                        start_date: { type: 'string' },
                        end_date: { type: 'string' },
                    },
                    required: ['manager_id'],
                },
            },
            {
                name: 'create_target',
                description: 'Assign a product target to a manager for a specific date',
                inputSchema: {
                    type: 'object',
                    properties: {
                        manager_id: { type: 'integer' },
                        product_name: { type: 'string' },
                        target_quantity: { type: 'integer' },
                        date: { type: 'string' },
                    },
                    required: ['manager_id', 'product_name', 'target_quantity', 'date'],
                },
            },
            {
                name: 'update_achievement',
                description: 'Update achievement count for a target',
                inputSchema: {
                    type: 'object',
                    properties: {
                        target_id: { type: 'integer' },
                        achievement: { type: 'integer' },
                    },
                    required: ['target_id', 'achievement'],
                },
            },
            {
                name: 'get_targets_by_manager',
                description: 'Retrieve targets for a manager and optional date range',
                inputSchema: {
                    type: 'object',
                    properties: {
                        manager_id: { type: 'integer' },
                        start_date: { type: 'string' },
                        end_date: { type: 'string' },
                    },
                    required: ['manager_id'],
                },
            },
            {
                name: 'update_manager_status',
                description: 'Update manager status (In-Office / Out-of-Office)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        manager_id: { type: 'integer' },
                        status: { type: 'string', enum: ['In-Office', 'Out-of-Office'] },
                        latitude: { type: 'number' },
                        longitude: { type: 'number' },
                    },
                    required: ['manager_id', 'status'],
                },
            },
        ],
    }
})

// Tool Call Handler
server.setRequestHandler('tools/call', async (request) => {
    const { name, arguments: args } = request.params

    try {
        let result
        switch (name) {
            case 'authenticate_user':
                result = await authenticateUser(args)
                break
            case 'create_user':
                result = await createUser(args)
                break
            case 'get_user_by_id':
                result = await getUserById(args)
                break
            case 'list_all_users':
                result = await listAllUsers()
                break
            case 'create_visit':
                result = await createVisit(args)
                break
            case 'get_visits_by_manager':
                result = await getVisitsByManager(args)
                break
            case 'create_target':
                result = await createTarget(args)
                break
            case 'update_achievement':
                result = await updateAchievement(args)
                break
            case 'get_targets_by_manager':
                result = await getTargetsByManager(args)
                break
            case 'update_manager_status':
                result = await updateManagerStatus(args)
                break
            default:
                throw new Error(`Unknown tool: ${name}`)
        }

        return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
        }
    } catch (error) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }) }],
            isError: true,
        }
    }
})

// Database Operations
async function authenticateUser(args) {
    const stmt = db.prepare('SELECT * FROM Users WHERE username = ?')
    const user = stmt.get(args.username)

    if (!user) {
        return { success: false, message: 'Invalid credentials' }
    }

    const match = await bcrypt.compare(args.password, user.password_hash)

    if (match) {
        // Generate JWT token
        const token = jwt.sign(
            { user_id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        )

        // Update last login
        const updateStmt = db.prepare('UPDATE Users SET last_login = datetime("now") WHERE id = ?')
        updateStmt.run(user.id)

        return {
            success: true,
            user_id: user.id,
            username: user.username,
            role: user.role,
            full_name: user.full_name,
            token: token,
        }
    }

    return { success: false, message: 'Invalid credentials' }
}

async function createUser(args) {
    const hashedPassword = await bcrypt.hash(args.password, 10)

    try {
        const stmt = db.prepare(`
      INSERT INTO Users (username, password_hash, full_name, role, email, phone) 
      VALUES (?, ?, ?, ?, ?, ?)
    `)

        const result = stmt.run(
            args.username,
            hashedPassword,
            args.full_name,
            args.role,
            args.email,
            args.phone || null
        )

        return {
            success: true,
            user_id: result.lastInsertRowid,
        }
    } catch (error) {
        if (error.message.includes('UNIQUE constraint')) {
            return { success: false, message: 'Username or email already exists' }
        }
        throw error
    }
}

async function getUserById(args) {
    const stmt = db.prepare('SELECT id, username, full_name, role, email, phone, created_at FROM Users WHERE id = ?')
    const user = stmt.get(args.user_id)
    return user || { success: false, message: 'User not found' }
}

async function listAllUsers() {
    const stmt = db.prepare('SELECT id, username, full_name, role, email, phone, created_at, last_login FROM Users')
    const users = stmt.all()
    return { success: true, users }
}

async function createVisit(args) {
    try {
        // Extract date from time_in for indexing
        const date = args.time_in.split('T')[0]

        const stmt = db.prepare(`
      INSERT INTO Visits (manager_id, customer_name, time_in, time_out, mom, latitude, longitude, status, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

        const result = stmt.run(
            args.manager_id,
            args.customer_name,
            args.time_in,
            args.time_out || null,
            args.mom || null,
            args.latitude || null,
            args.longitude || null,
            args.status,
            date
        )

        return {
            success: true,
            visit_id: result.lastInsertRowid,
        }
    } catch (error) {
        throw error
    }
}

async function getVisitsByManager(args) {
    let query = 'SELECT * FROM Visits WHERE manager_id = ?'
    const params = [args.manager_id]

    if (args.start_date && args.end_date) {
        query += ' AND date BETWEEN ? AND ?'
        params.push(args.start_date, args.end_date)
    }

    query += ' ORDER BY time_in DESC'

    const stmt = db.prepare(query)
    const visits = stmt.all(...params)

    return { success: true, visits }
}

async function createTarget(args) {
    try {
        const stmt = db.prepare(`
      INSERT INTO Targets (manager_id, product_name, target_quantity, date)
      VALUES (?, ?, ?, ?)
    `)

        const result = stmt.run(args.manager_id, args.product_name, args.target_quantity, args.date)

        return {
            success: true,
            target_id: result.lastInsertRowid,
        }
    } catch (error) {
        if (error.message.includes('UNIQUE constraint')) {
            return { success: false, message: 'Target already exists for this product and date' }
        }
        throw error
    }
}

async function updateAchievement(args) {
    const stmt = db.prepare('UPDATE Targets SET achievement = ?, updated_at = datetime("now") WHERE id = ?')
    const result = stmt.run(args.achievement, args.target_id)

    if (result.changes > 0) {
        return { success: true }
    }
    return { success: false, message: 'Target not found' }
}

async function getTargetsByManager(args) {
    let query = 'SELECT * FROM Targets WHERE manager_id = ?'
    const params = [args.manager_id]

    if (args.start_date && args.end_date) {
        query += ' AND date BETWEEN ? AND ?'
        params.push(args.start_date, args.end_date)
    }

    query += ' ORDER BY date DESC'

    const stmt = db.prepare(query)
    const targets = stmt.all(...params)

    return { success: true, targets }
}

async function updateManagerStatus(args) {
    try {
        const stmt = db.prepare(`
      INSERT INTO StatusHistory (manager_id, status, latitude, longitude)
      VALUES (?, ?, ?, ?)
    `)

        stmt.run(args.manager_id, args.status, args.latitude || null, args.longitude || null)

        return { success: true }
    } catch (error) {
        throw error
    }
}

// Start Server
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('Sales CRM MCP Server running on stdio')
}

main().catch((error) => {
    console.error('Server error:', error)
    process.exit(1)
})
