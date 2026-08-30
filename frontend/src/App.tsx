import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/layout/Layout'
import ProtectedRoute from './components/auth/ProtectedRoute'
import HomePage from './pages/HomePage'
import WorkspacePage from './pages/WorkspacePage'
import SettingsPage from './pages/SettingsPage'
import EditorPage from './pages/EditorPage'
import PdfPreviewPage from './pages/PdfPreviewPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AgentsPage from './pages/AgentsPage'
import SchedulesPage from './pages/SchedulesPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/workspaces/:id" element={<WorkspacePage />} />
              <Route path="/workspaces/:id/settings" element={<SettingsPage />} />
              <Route path="/workspaces/:id/agents" element={<AgentsPage />} />
              <Route path="/workspaces/:id/schedules" element={<SchedulesPage />} />
            </Route>
            <Route path="/editor/:id" element={<EditorPage />} />
            <Route path="/pdf/:id" element={<PdfPreviewPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
