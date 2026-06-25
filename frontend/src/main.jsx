// ---------------------------------------------------------------------------
// Entry point — wraps the app with Router and ThemeProvider.
// Multi-page routing: Home, Watch (player), Category, Admin
// ---------------------------------------------------------------------------
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import WatchPage from './pages/WatchPage.jsx';
import CategoryPage from './pages/CategoryPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/watch" element={<WatchPage />} />
            <Route path="/category/:group" element={<CategoryPage />} />
          </Route>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
