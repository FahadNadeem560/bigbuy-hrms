import { supabase } from "../lib/supabaseClient";

export async function fetchPayrollComparison(fromMonth, toMonth, scope = "company") {
  const { data, error } = await supabase.rpc("get_payroll_comparison_summary", {
    p_from_month: fromMonth,
    p_to_month: toMonth,
    p_scope: scope,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchEmployeePayrollHistory(employeeCode, months = 12) {
  const { data, error } = await supabase.rpc("get_employee_payroll_history", {
    p_employee_code: employeeCode,
    p_months: months,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchPayrollOutliers(fromMonth, toMonth, branch = null, department = null) {
  const { data, error } = await supabase.rpc("get_payroll_employee_outliers", {
    p_from_month: fromMonth,
    p_to_month: toMonth,
    p_branch: branch,
    p_department: department,
  });
  if (error) throw error;
  return data || [];
}
