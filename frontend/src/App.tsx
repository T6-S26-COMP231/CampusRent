import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import BrowsePage from './pages/BrowsePage';
import ListingDetailsRoute from './pages/ListingDetailsRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AccountPage from './pages/AccountPage';
import MyListingsPage from './pages/MyListingsPage';
import CreateListingPage from './pages/CreateListingPage';
import EditListingPage from './pages/EditListingPage';
import RequestsPage from './pages/RequestsPage';
import MyRequestsPage from './pages/MyRequestsPage';
import ConversationsPage from './pages/ConversationsPage';
import ConversationDetailPage from './pages/ConversationDetailPage';
import AdminPage from './pages/AdminPage';

function ProtectedRoute({
  children,
  requireVerifiedStudent = false,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireVerifiedStudent?: boolean;
  requireAdmin?: boolean;
}) {
  const { user, loading, isVerified, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-campus-200 border-t-campus-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requireAdmin && !isAdmin) {
    return <Navigate to={isVerified ? '/browse' : '/account'} replace />;
  }

  if (requireVerifiedStudent && !isVerified) {
    return <Navigate to={isAdmin ? '/admin' : '/account'} replace />;
  }

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isVerified, isAdmin } = useAuth();

  if (loading) return null;
  if (!user) return <>{children}</>;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (isVerified) return <Navigate to="/browse" replace />;
  return <Navigate to="/account" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        {/*
          US-01.2 — /browse is open so guests can use GuestCatalogue.
          BrowsePage still routes verified students to the registered catalogue.
          US-02.5 — /listings/:id chooses guest basic details vs US-10 full details
          after auth resolves (ListingDetailsRoute). Edit/create/rental routes stay
          behind requireVerifiedStudent.
        */}
        <Route path="browse" element={<BrowsePage />} />
        <Route path="listings/:id" element={<ListingDetailsRoute />} />
        <Route
          path="login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="register"
          element={
            <PublicOnlyRoute>
              <RegisterPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="account"
          element={
            <ProtectedRoute>
              <AccountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-listings"
          element={
            <ProtectedRoute requireVerifiedStudent>
              <MyListingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="listings/new"
          element={
            <ProtectedRoute requireVerifiedStudent>
              <CreateListingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="listings/:id/edit"
          element={
            <ProtectedRoute requireVerifiedStudent>
              <EditListingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="requests"
          element={
            <ProtectedRoute requireVerifiedStudent>
              <RequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="my-requests"
          element={
            <ProtectedRoute requireVerifiedStudent>
              <MyRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="conversations"
          element={
            <ProtectedRoute requireVerifiedStudent>
              <ConversationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="conversations/:id"
          element={
            <ProtectedRoute requireVerifiedStudent>
              <ConversationDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin"
          element={
            <ProtectedRoute requireAdmin>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
