import './utils/fetch-setup'; // Configure fetch to always include credentials
import { Routes, Route, BrowserRouter as Router } from "react-router-dom";
import { AuthProvider } from "@/react-app/context/AuthContext";
import { ToastProvider } from "@/react-app/hooks/useToast";

import HomePage from "@/react-app/pages/Home";
import Inspections from "@/react-app/pages/Inspections";
import NewInspection from "@/react-app/pages/NewInspection";
import EditInspection from "@/react-app/pages/EditInspection";
import InspectionDetail from "@/react-app/pages/InspectionDetail";
import Reports from "@/react-app/pages/Reports";
import Settings from "@/react-app/pages/Settings";
import ChecklistTemplates from "@/react-app/pages/ChecklistTemplates";
import NewChecklistTemplate from "@/react-app/pages/NewChecklistTemplate";
import AIChecklistGenerator from "@/react-app/pages/AIChecklistGenerator";
import CSVImport from "@/react-app/pages/CSVImport";
import ChecklistDetail from "@/react-app/pages/ChecklistDetail";
import ChecklistTemplateEdit from "@/react-app/pages/ChecklistTemplateEdit";
import ActionPlan from "@/react-app/pages/ActionPlan";
import ActionPlans from "@/react-app/pages/ActionPlans";
import ActivitiesHub from "@/react-app/pages/ActivitiesHub";
import Login from "@/react-app/pages/Login";
import Register from "@/react-app/pages/Register";
import AuthCallback from "@/react-app/pages/AuthCallback";
import AuthGuard from "@/react-app/components/AuthGuard";
import Users from "@/react-app/pages/Users";
import UserProfile from "@/react-app/pages/UserProfile";
import Organizations from "@/react-app/pages/Organizations";
import OrganizationProfile from "@/react-app/pages/OrganizationProfile";
import SharedInspection from "@/react-app/pages/SharedInspection";
import AcceptInvitation from "@/react-app/pages/AcceptInvitation";
import RolePermissions from "@/react-app/pages/RolePermissions";
import AdminDataSync from "@/react-app/pages/AdminDataSync";
import LandingPage from "@/react-app/pages/LandingPage";

// Demo Banner removed


export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>

        <Router>
          <Routes>
            {/* Public routes */}
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/shared/:token" element={<SharedInspection />} />
            <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />

            {/* Protected routes */}
            <Route path="/" element={<AuthGuard><HomePage /></AuthGuard>} />
            <Route path="/inspections" element={<AuthGuard><Inspections /></AuthGuard>} />
            <Route path="/inspections/new" element={<AuthGuard><NewInspection /></AuthGuard>} />
            <Route path="/inspections/:id/edit" element={<AuthGuard><EditInspection /></AuthGuard>} />
            <Route path="/inspections/:id" element={<AuthGuard><InspectionDetail /></AuthGuard>} />
            <Route path="/reports" element={<AuthGuard><Reports /></AuthGuard>} />
            <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
            <Route path="/settings/permissions" element={<AuthGuard requiredRole="system_admin"><RolePermissions /></AuthGuard>} />
            <Route path="/admin/data-sync" element={<AuthGuard requiredRole="system_admin"><AdminDataSync /></AuthGuard>} />


            <Route path="/checklists" element={<AuthGuard><ChecklistTemplates /></AuthGuard>} />
            <Route path="/checklists/new" element={<AuthGuard><NewChecklistTemplate /></AuthGuard>} />
            <Route path="/checklists/ai-generate" element={<AuthGuard><AIChecklistGenerator /></AuthGuard>} />
            <Route path="/checklists/import" element={<AuthGuard><CSVImport /></AuthGuard>} />
            <Route path="/checklists/:id" element={<AuthGuard><ChecklistDetail /></AuthGuard>} />
            <Route path="/checklists/:id/edit" element={<AuthGuard><ChecklistTemplateEdit /></AuthGuard>} />
            <Route path="/inspections/:id/action-plan" element={<AuthGuard><ActionPlan /></AuthGuard>} />
            <Route path="/action-plans" element={<AuthGuard><ActionPlans /></AuthGuard>} />
            <Route path="/activities" element={<AuthGuard><ActivitiesHub /></AuthGuard>} />

            {/* Admin routes */}
            <Route path="/users" element={<AuthGuard requiredRoles={["system_admin", "admin"]}><Users /></AuthGuard>} />
            <Route path="/organizations" element={<AuthGuard requiredRoles={["system_admin", "admin", "org_admin", "manager"]}><Organizations /></AuthGuard>} />
            <Route path="/organizations/:id" element={<AuthGuard requiredRoles={["system_admin", "admin", "org_admin", "manager"]}><OrganizationProfile /></AuthGuard>} />
            <Route path="/profile" element={<AuthGuard><UserProfile /></AuthGuard>} />
          </Routes>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}
