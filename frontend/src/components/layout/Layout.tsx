import { Outlet, useLocation } from 'react-router-dom'
import { WorkspaceProvider } from '../../contexts/WorkspaceContext'
import Sidebar from './Sidebar'
import ChatDock from '../chat/ChatDock'

export default function Layout() {
  const { pathname } = useLocation()
  const workspaceId = pathname.match(/^\/workspaces\/([^/]+)/)?.[1]

  return (
    <WorkspaceProvider>
      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar />
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <Outlet />
        </div>
        <ChatDock workspaceId={workspaceId} />
      </div>
    </WorkspaceProvider>
  )
}
