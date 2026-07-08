import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import Header  from './Header';
import { ChatNotifyProvider } from '../../contexts/ChatNotifyContext';

export default function AppLayout() {
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const location    = useLocation();
  const prevPath    = useRef(location.pathname);

  useEffect(() => {
    const msg = sessionStorage.getItem('welcome_msg');
    if (msg) { toast.success(msg); sessionStorage.removeItem('welcome_msg'); }
  }, []);

  useEffect(() => {
    const check = () => setSidebarCollapsed(window.innerWidth <= 992);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Only re-trigger animation when the actual path segment changes (not query/hash)
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      setAnimKey(k => k + 1);
    }
  }, [location.pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <ChatNotifyProvider>
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <div className={`sidebar-overlay${sidebarOpen ? ' show' : ''}`} onClick={closeSidebar} />

      <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`}>
        <Sidebar onLinkClick={closeSidebar} collapsed={sidebarCollapsed} />
      </aside>

      <header className="app-header">
        <Header
          onMenuClick={() => setSidebarOpen(o => !o)}
          onCollapseClick={() => setSidebarCollapsed(c => !c)}
        />
      </header>

      <main className="app-main">
        {/* key on div (not Outlet) avoids remounting page components; CSS handles the fade */}
        <div key={animKey} className="page-transition">
          <Outlet />
        </div>
      </main>
    </div>
    </ChatNotifyProvider>
  );
}
