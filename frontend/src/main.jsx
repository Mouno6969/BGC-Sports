// ---------------------------------------------------------------------------
// Entry point — data router (RouterProvider) so Link/navigate viewTransition
// uses the View Transitions API for page + shared-element morphs.
// ---------------------------------------------------------------------------
import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
  useNavigation,
} from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { PageSkeleton } from './components/Skeleton.jsx';
import { initErrorTracker } from './lib/errorTracker.js';
import { installGlobalHaptics } from './lib/haptics.js';
import { preloadWatchPage } from './lib/viewTransitions.js';
import './index.css';

// Start client error reporting ASAP (backend intake + optional Sentry)
initErrorTracker();
// Subtle Vibration API feedback on buttons / tabs / nav (mobile only)
installGlobalHaptics();

const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const WatchPage = lazy(() => import('./pages/WatchPage.jsx'));
const CategoryPage = lazy(() => import('./pages/CategoryPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));
const MatchCenterPage = lazy(() => import('./pages/MatchCenterPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'));

/** Route-aware Suspense fallback — skeleton matches destination layout. */
function PageLoader() {
  const location = useLocation();
  const navigation = useNavigation();
  const pathname = navigation.location?.pathname || location.pathname;
  let variant = 'home';
  if (pathname.startsWith('/watch')) variant = 'watch';
  else if (pathname.startsWith('/match')) variant = 'match';
  else if (pathname.startsWith('/profile')) variant = 'profile';
  else if (pathname.startsWith('/category')) variant = 'category';
  return <PageSkeleton variant={variant} />;
}

function SuspenseOutlet() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    element: <SuspenseOutlet />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/watch', element: <WatchPage /> },
          { path: '/watch/:slug', element: <WatchPage /> },
          { path: '/category/:group', element: <CategoryPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/match/:slug', element: <MatchCenterPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '/admin', element: <AdminPage /> },
    ],
  },
]);

// Warm the watch chunk in idle time so card → player morphs hit a ready player.
if (typeof window !== 'undefined') {
  const warm = () => {
    preloadWatchPage().catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 4000 });
  } else {
    window.setTimeout(warm, 2000);
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // Cache-bust the SW URL so browsers fetch the latest controller after deploys.
    navigator.serviceWorker
      .register('/sw.js?v=18')
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
