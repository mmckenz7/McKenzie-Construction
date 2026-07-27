"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  roles: string[] | null;
  status: string;
  is_default_lead_owner: boolean;
  is_default_estimator: boolean;
  is_default_project_manager: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CompanySettings = {
  id: string;
  company_name: string;
  require_responsible_person: boolean;
  require_task_assignee: boolean;
  require_project_manager: boolean;
  allow_unassigned_leads: boolean;
  allow_unassigned_tasks: boolean;
  automatically_assign_new_leads: boolean;
  automatically_assign_new_tasks: boolean;
  automatically_assign_converted_projects: boolean;
  default_lead_owner_id: string | null;
  default_estimator_id: string | null;
  default_project_manager_id: string | null;
};

type TeamManagerProps = {
  initialTeamMembers: TeamMember[];
  initialCompanySettings: CompanySettings | null;
};

type MemberFormState = {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  roles: string[];
  status: string;
  notes: string;
};

const roleOptions = [
  {
    value: "owner",
    label: "Owner",
  },
  {
    value: "admin",
    label: "Administrator",
  },
  {
    value: "sales",
    label: "Sales",
  },
  {
    value: "estimator",
    label: "Estimator",
  },
  {
    value: "project_manager",
    label: "Project Manager",
  },
  {
    value: "superintendent",
    label: "Superintendent",
  },
  {
    value: "field_employee",
    label: "Field Employee",
  },
  {
    value: "office",
    label: "Office",
  },
];

const emptyMemberForm: MemberFormState = {
  name: "",
  email: "",
  phone: "",
  jobTitle: "",
  roles: [],
  status: "active",
  notes: "",
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getMemberForm(
  member: TeamMember,
): MemberFormState {
  return {
    name: member.name,
    email: member.email ?? "",
    phone: member.phone ?? "",
    jobTitle: member.job_title ?? "",
    roles: member.roles ?? [],
    status: member.status,
    notes: member.notes ?? "",
  };
}

export default function TeamManager({
  initialTeamMembers,
  initialCompanySettings,
}: TeamManagerProps) {
  const router = useRouter();

  const [teamMembers, setTeamMembers] = useState(
    initialTeamMembers,
  );

  const [settings, setSettings] = useState(
    initialCompanySettings,
  );

  const [selectedMemberId, setSelectedMemberId] =
    useState<string | null>(null);

  const [memberForm, setMemberForm] =
    useState<MemberFormState>(
      emptyMemberForm,
    );

  const [isSavingMember, setIsSavingMember] =
    useState(false);

  const [isSavingSettings, setIsSavingSettings] =
    useState(false);

  const [memberMessage, setMemberMessage] =
    useState("");

  const [memberError, setMemberError] =
    useState("");

  const [settingsMessage, setSettingsMessage] =
    useState("");

  const [settingsError, setSettingsError] =
    useState("");

  const activeMembers = useMemo(
    () =>
      teamMembers.filter(
        (member) => member.status === "active",
      ),
    [teamMembers],
  );

  const selectedMember = useMemo(
    () =>
      teamMembers.find(
        (member) =>
          member.id === selectedMemberId,
      ) ?? null,
    [selectedMemberId, teamMembers],
  );

  function clearMemberMessages() {
    setMemberMessage("");
    setMemberError("");
  }

  function clearSettingsMessages() {
    setSettingsMessage("");
    setSettingsError("");
  }

  function startNewMember() {
    setSelectedMemberId(null);
    setMemberForm(emptyMemberForm);
    clearMemberMessages();
  }

  function editMember(member: TeamMember) {
    setSelectedMemberId(member.id);
    setMemberForm(getMemberForm(member));
    clearMemberMessages();
  }

  function toggleRole(role: string) {
    clearMemberMessages();

    setMemberForm((current) => {
      const hasRole =
        current.roles.includes(role);

      return {
        ...current,
        roles: hasRole
          ? current.roles.filter(
              (existingRole) =>
                existingRole !== role,
            )
          : [...current.roles, role],
      };
    });
  }

  async function saveMember(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    clearMemberMessages();

    if (!memberForm.name.trim()) {
      setMemberError(
        "Employee name is required.",
      );
      return;
    }

    if (memberForm.roles.length === 0) {
      setMemberError(
        "Choose at least one employee role.",
      );
      return;
    }

    setIsSavingMember(true);

    try {
      const response = await fetch(
        selectedMemberId
          ? `/api/team/${encodeURIComponent(
              selectedMemberId,
            )}`
          : "/api/team",
        {
          method: selectedMemberId
            ? "PATCH"
            : "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: memberForm.name,
            email: memberForm.email,
            phone: memberForm.phone,
            jobTitle: memberForm.jobTitle,
            roles: memberForm.roles,
            status: memberForm.status,
            notes: memberForm.notes,
          }),
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        member?: TeamMember;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Unable to save the employee.",
        );
      }

      if (!result.member) {
        throw new Error(
          "The employee record was not returned.",
        );
      }

      if (selectedMemberId) {
        setTeamMembers((current) =>
          current.map((member) =>
            member.id === selectedMemberId
              ? result.member!
              : member,
          ),
        );

        setMemberMessage(
          "Employee updated.",
        );
      } else {
        setTeamMembers((current) =>
          [...current, result.member!].sort(
            (first, second) =>
              first.name.localeCompare(
                second.name,
              ),
          ),
        );

        setSelectedMemberId(
          result.member.id,
        );

        setMemberMessage(
          "Employee added.",
        );
      }

      setMemberForm(
        getMemberForm(result.member),
      );

      router.refresh();
    } catch (error) {
      setMemberError(
        error instanceof Error
          ? error.message
          : "Unable to save the employee.",
      );
    } finally {
      setIsSavingMember(false);
    }
  }

  async function toggleMemberStatus(
    member: TeamMember,
  ) {
    clearMemberMessages();

    const newStatus =
      member.status === "active"
        ? "inactive"
        : "active";

    setIsSavingMember(true);

    try {
      const response = await fetch(
        `/api/team/${encodeURIComponent(
          member.id,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        member?: TeamMember;
        error?: string;
      };

      if (
        !response.ok ||
        !result.success ||
        !result.member
      ) {
        throw new Error(
          result.error ??
            "Unable to update employee status.",
        );
      }

      setTeamMembers((current) =>
        current.map((existingMember) =>
          existingMember.id === member.id
            ? result.member!
            : existingMember,
        ),
      );

      if (
        selectedMemberId === member.id
      ) {
        setMemberForm(
          getMemberForm(result.member),
        );
      }

      setMemberMessage(
        newStatus === "active"
          ? "Employee activated."
          : "Employee deactivated.",
      );

      router.refresh();
    } catch (error) {
      setMemberError(
        error instanceof Error
          ? error.message
          : "Unable to update employee status.",
      );
    } finally {
      setIsSavingMember(false);
    }
  }

  async function saveSettings(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    clearSettingsMessages();

    if (!settings) {
      setSettingsError(
        "Company settings are unavailable.",
      );
      return;
    }

    if (
      settings.require_responsible_person &&
      !settings.default_lead_owner_id
    ) {
      setSettingsError(
        "Choose a default lead owner before requiring a responsible person.",
      );
      return;
    }

    if (
      settings.require_task_assignee &&
      activeMembers.length === 0
    ) {
      setSettingsError(
        "At least one active employee is required before task assignments can be required.",
      );
      return;
    }

    if (
      settings.require_project_manager &&
      !settings.default_project_manager_id
    ) {
      setSettingsError(
        "Choose a default project manager before requiring one.",
      );
      return;
    }

    setIsSavingSettings(true);

    try {
      const response = await fetch(
        "/api/company-settings",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            requireResponsiblePerson:
              settings.require_responsible_person,
            requireTaskAssignee:
              settings.require_task_assignee,
            requireProjectManager:
              settings.require_project_manager,
            allowUnassignedLeads:
              settings.allow_unassigned_leads,
            allowUnassignedTasks:
              settings.allow_unassigned_tasks,
            automaticallyAssignNewLeads:
              settings.automatically_assign_new_leads,
            automaticallyAssignNewTasks:
              settings.automatically_assign_new_tasks,
            automaticallyAssignConvertedProjects:
              settings.automatically_assign_converted_projects,
            defaultLeadOwnerId:
              settings.default_lead_owner_id,
            defaultEstimatorId:
              settings.default_estimator_id,
            defaultProjectManagerId:
              settings.default_project_manager_id,
          }),
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        settings?: CompanySettings;
        error?: string;
      };

      if (
        !response.ok ||
        !result.success ||
        !result.settings
      ) {
        throw new Error(
          result.error ??
            "Unable to save company settings.",
        );
      }

      setSettings(result.settings);
      setSettingsMessage(
        "Assignment settings saved.",
      );

      router.refresh();
    } catch (error) {
      setSettingsError(
        error instanceof Error
          ? error.message
          : "Unable to save company settings.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Team
              </p>

              <h2 className="mt-1 text-xl font-bold text-slate-950">
                Employees
              </h2>
            </div>

            <button
              type="button"
              onClick={startNewMember}
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white"
            >
              Add Employee
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {teamMembers.length === 0 ? (
              <p className="text-sm text-slate-600">
                No employees have been added.
              </p>
            ) : (
              teamMembers.map((member) => (
                <article
                  key={member.id}
                  className={`rounded-xl border p-4 ${
                    selectedMemberId === member.id
                      ? "border-amber-400 bg-amber-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      editMember(member)
                    }
                    className="block w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-950">
                          {member.name}
                        </h3>

                        <p className="mt-1 text-sm text-slate-600">
                          {member.job_title ??
                            "No title"}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          member.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : member.status ===
                                "invited"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {member.status}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(member.roles ?? []).map(
                        (role) => (
                          <span
                            key={role}
                            className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600"
                          >
                            {titleCase(role)}
                          </span>
                        ),
                      )}
                    </div>

                    {member.is_default_lead_owner ||
                    member.is_default_estimator ||
                    member.is_default_project_manager ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {member.is_default_lead_owner ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                            Default Lead Owner
                          </span>
                        ) : null}

                        {member.is_default_estimator ? (
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold text-sky-800">
                            Default Estimator
                          </span>
                        ) : null}

                        {member.is_default_project_manager ? (
                          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-800">
                            Default PM
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void toggleMemberStatus(
                        member,
                      )
                    }
                    disabled={isSavingMember}
                    className="mt-4 text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4 disabled:text-slate-300"
                  >
                    {member.status === "active"
                      ? "Deactivate employee"
                      : "Activate employee"}
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </aside>

      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              Employee Record
            </p>

            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              {selectedMember
                ? `Edit ${selectedMember.name}`
                : "Add Employee"}
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Roles are organizational labels for now. Employee login
              permissions will be added later.
            </p>
          </div>

          <form
            onSubmit={saveMember}
            className="mt-6 space-y-5"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Name
                </span>

                <input
                  type="text"
                  value={memberForm.name}
                  onChange={(event) => {
                    setMemberForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }));
                    clearMemberMessages();
                  }}
                  disabled={isSavingMember}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Job Title
                </span>

                <input
                  type="text"
                  value={memberForm.jobTitle}
                  onChange={(event) => {
                    setMemberForm((current) => ({
                      ...current,
                      jobTitle:
                        event.target.value,
                    }));
                    clearMemberMessages();
                  }}
                  disabled={isSavingMember}
                  placeholder="Owner, Project Manager, Sales Representative"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Email
                </span>

                <input
                  type="email"
                  value={memberForm.email}
                  onChange={(event) => {
                    setMemberForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }));
                    clearMemberMessages();
                  }}
                  disabled={isSavingMember}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Phone
                </span>

                <input
                  type="tel"
                  value={memberForm.phone}
                  onChange={(event) => {
                    setMemberForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }));
                    clearMemberMessages();
                  }}
                  disabled={isSavingMember}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-bold text-slate-950">
                Roles
              </legend>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {roleOptions.map((role) => {
                  const isSelected =
                    memberForm.roles.includes(
                      role.value,
                    );

                  return (
                    <label
                      key={role.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                        isSelected
                          ? "border-amber-400 bg-amber-50"
                          : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() =>
                          toggleRole(role.value)
                        }
                        disabled={isSavingMember}
                        className="h-4 w-4"
                      />

                      <span className="text-sm font-semibold text-slate-800">
                        {role.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Status
                </span>

                <select
                  value={memberForm.status}
                  onChange={(event) => {
                    setMemberForm((current) => ({
                      ...current,
                      status:
                        event.target.value,
                    }));
                    clearMemberMessages();
                  }}
                  disabled={isSavingMember}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                >
                  <option value="active">
                    Active
                  </option>

                  <option value="inactive">
                    Inactive
                  </option>

                  <option value="invited">
                    Invited
                  </option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Notes
              </span>

              <textarea
                value={memberForm.notes}
                onChange={(event) => {
                  setMemberForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }));
                  clearMemberMessages();
                }}
                disabled={isSavingMember}
                rows={4}
                placeholder="Optional internal notes"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSavingMember}
                className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-400"
              >
                {isSavingMember
                  ? "Saving..."
                  : selectedMemberId
                    ? "Save Employee"
                    : "Add Employee"}
              </button>

              {selectedMemberId ? (
                <button
                  type="button"
                  onClick={startNewMember}
                  disabled={isSavingMember}
                  className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700"
                >
                  Add Another Employee
                </button>
              ) : null}
            </div>

            {memberMessage ? (
              <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {memberMessage}
              </p>
            ) : null}

            {memberError ? (
              <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {memberError}
              </p>
            ) : null}
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Company Configuration
            </p>

            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              Assignment Settings
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Choose default responsible people and decide whether
              assignments are optional or required.
            </p>
          </div>

          {!settings ? (
            <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              Company settings could not be loaded.
            </p>
          ) : (
            <form
              onSubmit={saveSettings}
              className="mt-6 space-y-7"
            >
              <div className="grid gap-5 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-950">
                    Default Lead Owner
                  </span>

                  <select
                    value={
                      settings.default_lead_owner_id ??
                      ""
                    }
                    onChange={(event) => {
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              default_lead_owner_id:
                                event.target
                                  .value || null,
                            }
                          : current,
                      );
                      clearSettingsMessages();
                    }}
                    disabled={isSavingSettings}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                  >
                    <option value="">
                      No default
                    </option>

                    {activeMembers.map(
                      (member) => (
                        <option
                          key={member.id}
                          value={member.id}
                        >
                          {member.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-950">
                    Default Estimator
                  </span>

                  <select
                    value={
                      settings.default_estimator_id ??
                      ""
                    }
                    onChange={(event) => {
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              default_estimator_id:
                                event.target
                                  .value || null,
                            }
                          : current,
                      );
                      clearSettingsMessages();
                    }}
                    disabled={isSavingSettings}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                  >
                    <option value="">
                      No default
                    </option>

                    {activeMembers.map(
                      (member) => (
                        <option
                          key={member.id}
                          value={member.id}
                        >
                          {member.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-slate-950">
                    Default Project Manager
                  </span>

                  <select
                    value={
                      settings.default_project_manager_id ??
                      ""
                    }
                    onChange={(event) => {
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              default_project_manager_id:
                                event.target
                                  .value || null,
                            }
                          : current,
                      );
                      clearSettingsMessages();
                    }}
                    disabled={isSavingSettings}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                  >
                    <option value="">
                      No default
                    </option>

                    {activeMembers.map(
                      (member) => (
                        <option
                          key={member.id}
                          value={member.id}
                        >
                          {member.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <div>
                <h3 className="font-bold text-slate-950">
                  Required Assignments
                </h3>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        settings.require_responsible_person
                      }
                      onChange={(event) => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                require_responsible_person:
                                  event.target
                                    .checked,
                              }
                            : current,
                        );
                        clearSettingsMessages();
                      }}
                      disabled={isSavingSettings}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        Require Lead Owner
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        Leads cannot remain unassigned.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        settings.require_task_assignee
                      }
                      onChange={(event) => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                require_task_assignee:
                                  event.target
                                    .checked,
                              }
                            : current,
                        );
                        clearSettingsMessages();
                      }}
                      disabled={isSavingSettings}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        Require Task Assignee
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        Every task must have a responsible person.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        settings.require_project_manager
                      }
                      onChange={(event) => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                require_project_manager:
                                  event.target
                                    .checked,
                              }
                            : current,
                        );
                        clearSettingsMessages();
                      }}
                      disabled={isSavingSettings}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        Require Project Manager
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        Converted projects must have a project manager.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-950">
                  Automatic Assignment
                </h3>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        settings.automatically_assign_new_leads
                      }
                      onChange={(event) => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                automatically_assign_new_leads:
                                  event.target
                                    .checked,
                              }
                            : current,
                        );
                        clearSettingsMessages();
                      }}
                      disabled={isSavingSettings}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        Auto-Assign Leads
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        Assign new leads to the default lead owner.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        settings.automatically_assign_new_tasks
                      }
                      onChange={(event) => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                automatically_assign_new_tasks:
                                  event.target
                                    .checked,
                              }
                            : current,
                        );
                        clearSettingsMessages();
                      }}
                      disabled={isSavingSettings}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        Auto-Assign Tasks
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        New tasks inherit the lead owner.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        settings.automatically_assign_converted_projects
                      }
                      onChange={(event) => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                automatically_assign_converted_projects:
                                  event.target
                                    .checked,
                              }
                            : current,
                        );
                        clearSettingsMessages();
                      }}
                      disabled={isSavingSettings}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        Auto-Assign Projects
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        Converted projects use the default project manager.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-950">
                  Allow Unassigned Records
                </h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        settings.allow_unassigned_leads
                      }
                      onChange={(event) => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                allow_unassigned_leads:
                                  event.target
                                    .checked,
                              }
                            : current,
                        );
                        clearSettingsMessages();
                      }}
                      disabled={isSavingSettings}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        Allow Unassigned Leads
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        Leads may temporarily have no responsible person.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      checked={
                        settings.allow_unassigned_tasks
                      }
                      onChange={(event) => {
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                allow_unassigned_tasks:
                                  event.target
                                    .checked,
                              }
                            : current,
                        );
                        clearSettingsMessages();
                      }}
                      disabled={isSavingSettings}
                      className="mt-1 h-4 w-4"
                    />

                    <span>
                      <span className="block text-sm font-bold text-slate-950">
                        Allow Unassigned Tasks
                      </span>

                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        Tasks may temporarily have no assignee.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingSettings}
                className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-400"
              >
                {isSavingSettings
                  ? "Saving..."
                  : "Save Assignment Settings"}
              </button>

              {settingsMessage ? (
                <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                  {settingsMessage}
                </p>
              ) : null}

              {settingsError ? (
                <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {settingsError}
                </p>
              ) : null}
            </form>
          )}
        </section>
      </div>
    </div>
  );
}