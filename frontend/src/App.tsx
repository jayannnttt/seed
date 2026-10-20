import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/ui";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import Dashboard from "./pages/Dashboard";
import Directory from "./pages/Directory";
import Inventory from "./pages/Inventory";
import Monitoring from "./pages/Monitoring";
import RescueNetwork from "./pages/RescueNetwork";
import RescueSimulation from "./pages/RescueSimulation";

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/rescue" element={<RescueNetwork />} />
            <Route path="/simulation" element={<RescueSimulation />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route
              path="*"
              element={
                <div className="py-20 text-center text-[14px] text-earth-500">
                  Page not found. Use the navigation to return to the dashboard.
                </div>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
