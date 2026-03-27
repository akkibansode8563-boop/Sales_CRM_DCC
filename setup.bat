@echo off
echo ========================================
echo Sales Manager CRM - Setup Script
echo ========================================
echo.

echo Step 1: Installing MCP Server Dependencies...
cd mcp-server
call npm install better-sqlite3
call npm install bcrypt
call npm install jsonwebtoken
echo.

echo Step 2: Initializing Database...
node init-db.js
echo.

echo Step 3: Installing Frontend Dependencies...
cd ..
call npm install react react-dom
call npm install react-router-dom zustand axios
call npm install vite @vitejs/plugin-react --save-dev
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo To start the application:
echo 1. Terminal 1: cd mcp-server ^&^& node server.js
echo 2. Terminal 2: npm run dev
echo.
pause
