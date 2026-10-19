export type NavigationPage =
  | "Dashboard"
  | "Customers"
  | "Jobs"
  | "Invoices"
  | "Costs"
  | "Masters"
  | "Users";

export type Page = NavigationPage | "New Job" | "New Vendor Invoice";

export const navigationPaths: Record<Page, string> = {
  Dashboard: "/dashboard",
  Customers: "/customers",
  Jobs: "/jobs",
  Invoices: "/invoices",
  Costs: "/costs",
  Masters: "/masters",
  Users: "/users",
  "New Job": "/jobs/new",
  "New Vendor Invoice": "/costs/new",
};

export function pageFromPathname(pathname: string): Page {
  const exact = Object.entries(navigationPaths).find(([, path]) => path === pathname)?.[0] as Page | undefined;
  if (exact) return exact;
  const basePath = pathname.split("/").filter(Boolean).slice(0, 1).join("/");
  if (!basePath) return "Dashboard";
  return (
    (Object.entries(navigationPaths).find(([, path]) => path === `/${basePath}`)?.[0] as
      | Page
      | undefined) ?? "Dashboard"
  );
}
