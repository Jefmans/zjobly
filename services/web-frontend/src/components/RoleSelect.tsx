import { ChangeEvent } from "react";
import { UserRole } from "../types";

type Props = {
  role: UserRole | null;
  variant?: "nav" | "welcome";
  onChange: (role: UserRole) => void;
};

export function RoleSelect({ role, variant = "nav", onChange }: Props) {
  const selectId = variant === "welcome" ? "welcome-role" : "nav-role";

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === "candidate" || value === "employer") {
      onChange(value);
    }
  };

  return (
    <div className={variant === "welcome" ? "role-switcher welcome" : "role-switcher"}>
      <label htmlFor={selectId}>Role</label>
      <select id={selectId} value={role ?? ""} onChange={handleChange}>
        <option value="" disabled>
          Choose a role
        </option>
        <option value="employer">Employer</option>
        <option value="candidate">Candidate</option>
      </select>
    </div>
  );
}
