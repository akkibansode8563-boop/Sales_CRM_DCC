import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ManagerDashboard from './pages/ManagerDashboard'
import AdminDashboard from './pages/AdminDashboard'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'

function App() {
    return (
        <Router>
            <div className="app">
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route
                        path="/register"
                        element={
                            <ProtectedRoute requireAdmin={true}>
                                <Register />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/manager"
                        element={
                            <ProtectedRoute>
                                <ManagerDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute requireAdmin={true}>
                                <AdminDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/" element={<Navigate to="/login" replace />} />
                </Routes>
            </div>
        </Router>
    )
}

export default App
