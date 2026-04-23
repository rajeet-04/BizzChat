import React from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ApiClientProvider } from "./ApiClientContext";
import { AuthProvider } from "./AuthContext";
import { ToastProvider } from "./components/ToastProvider";

export default function App() {
  return (
    <ApiClientProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </ApiClientProvider>
  );
}
