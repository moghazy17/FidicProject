
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import SignIn from "./components/auth/SignIn";
import { App } from "./App";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ContractManagement } from "./components/contracts/ContractManagement";
import { ObligationTracker } from "./components/tracking/ObligationTracker";
import { AIAssistant } from "./components/ai/AIAssistant";
import { Reports } from "./components/reports/Reports";
import { RegionsProjects } from "./components/regions/RegionsProjects";
import { Settings } from "./components/settings/Settings";
import { ProjectWorkspace } from "./components/project/ProjectWorkspace";

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Route - Sign In */}
          <Route path="/signin" element={<SignIn />} />

          {/* Protected Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <App />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="regions" element={<RegionsProjects />} />
            <Route path="contracts" element={<ContractManagement />} />
            <Route path="obligations" element={<ObligationTracker />} />
            <Route path="ai-assistant" element={<AIAssistant onClose={() => window.history.back()} contextType="general" />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="project/:projectId" element={<ProjectWorkspace />} />
          </Route>

          {/* Catch all - redirect to sign in */}
          <Route path="*" element={<Navigate to="/signin" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
