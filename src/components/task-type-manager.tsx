"use client";

import {
  FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type TaskType = {
  id: string;
  name: string;
  task_key: string;
  description: string | null;
  category: string;
  default_priority: string;
  due_mode: string;
  due_offset: number;
  assignment_strategy: string;
  default_assignee_id: string | null;
  is_system_type: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type TeamMember = {
  id: string;
  name: string;
  job_title: string | null;
  status: string;
};

type CompanySettings = {
  id: string;
  manual_task_due_mode: string;
  manual_task_due_offset: number;
  end_of_business_time: string;
};

type TaskTypeManagerProps = {
  initialTaskTypes: TaskType[];
  teamMembers: TeamMember[];
  initialCompanySettings: CompanySettings | null;
};

type TaskTypeFormState = {
  name: string;
  taskKey: string;
  description: string;
  category: string;
  defaultPriority: string;
  dueMode: string;
  dueOffset: number;
  assignmentStrategy: string;
  defaultAssigneeId: string;
  isActive: boolean;
};

const categoryOptions = [
  { value: "sales", label: "Sales" },
  { value: "project", label: "Project" },
  { value: "marketing", label: "Marketing" },
  { value: "accounting", label: "Accounting" },
  { value: "operations", label: "Operations" },
  {
    value: "customer_service",
    label: "Customer Service",
  },
  {
    value: "administrative",
    label: "Administrative",
  },
  { value: "owner", label: "Owner" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const dueModeOptions = [
  { value: "same_day", label: "Same day" },
  {
    value: "business_days",
    label: "Business days",
  },
  {
    value: "calendar_days",
    label: "Calendar days",
  },
  {
    value: "no_due_date",
    label: "No automatic due date",
  },
];

const assignmentOptions = [
  {
    value: "lead_owner",
    label: "Lead owner",
  },
  {
    value: "default_lead_owner",
    label: "Default lead owner",
  },
  {
    value: "default_estimator",
    label: "Default estimator",
  },
  {
    value: "default_project_manager",
    label: "Default project manager",
  },
  {
    value: "specific_employee",
    label: "Specific employee",
  },
  {
    value: "unassigned",
    label: "Leave unassigned",
  },
];

const emptyTaskTypeForm: TaskTypeFormState = {
  name: "",
  taskKey: "",
  description: "",
  category: "administrative",
  defaultPriority: "normal",
  dueMode: "business_days",
  dueOffset: 1,
  assignmentStrategy: "unassigned",
  defaultAssigneeId: "",
  isActive: true,
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function createTaskKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getTaskTypeForm(
  taskType: TaskType,
): TaskTypeFormState {
  return {
    name: taskType.name,
    taskKey: taskType.task_key,
    description: taskType.description ?? "",
    category: taskType.category,
    defaultPriority:
      taskType.default_priority,
    dueMode: taskType.due_mode,
    dueOffset: taskType.due_offset,
    assignmentStrategy:
      taskType.assignment_strategy,
    defaultAssigneeId:
      taskType.default_assignee_id ?? "",
    isActive: taskType.is_active,
  };
}

function getTimingLabel(taskType: TaskType) {
  if (taskType.due_mode === "same_day") {
    return "Same day";
  }

  if (taskType.due_mode === "no_due_date") {
    return "No automatic due date";
  }

  const unit =
    taskType.due_mode === "business_days"
      ? "business day"
      : "calendar day";

  return `${taskType.due_offset} ${unit}${
    taskType.due_offset === 1 ? "" : "s"
  }`;
}

function getAssignmentLabel(
  taskType: TaskType,
  teamMemberMap: Map<string, TeamMember>,
) {
  if (
    taskType.assignment_strategy ===
      "specific_employee" &&
    taskType.default_assignee_id
  ) {
    return (
      teamMemberMap.get(
        taskType.default_assignee_id,
      )?.name ?? "Specific employee"
    );
  }

  const option = assignmentOptions.find(
    (item) =>
      item.value ===
      taskType.assignment_strategy,
  );

  return option?.label ?? "Unassigned";
}

export default function TaskTypeManager({
  initialTaskTypes,
  teamMembers,
  initialCompanySettings,
}: TaskTypeManagerProps) {
  const router = useRouter();
  const editorRef =
    useRef<HTMLElement | null>(null);

  const [taskTypes, setTaskTypes] = useState(
    initialTaskTypes,
  );

  const [settings, setSettings] = useState(
    initialCompanySettings,
  );

  const [
    selectedTaskTypeId,
    setSelectedTaskTypeId,
  ] = useState<string | null>(null);

  const [taskTypeForm, setTaskTypeForm] =
    useState<TaskTypeFormState>(
      emptyTaskTypeForm,
    );

  const [
    isSavingTaskType,
    setIsSavingTaskType,
  ] = useState(false);

  const [
    isSavingSettings,
    setIsSavingSettings,
  ] = useState(false);

  const [
    taskTypeMessage,
    setTaskTypeMessage,
  ] = useState("");

  const [taskTypeError, setTaskTypeError] =
    useState("");

  const [
    settingsMessage,
    setSettingsMessage,
  ] = useState("");

  const [settingsError, setSettingsError] =
    useState("");

  const activeTeamMembers = useMemo(
    () =>
      teamMembers.filter(
        (member) =>
          member.status === "active",
      ),
    [teamMembers],
  );

  const teamMemberMap = useMemo(
    () =>
      new Map(
        teamMembers.map((member) => [
          member.id,
          member,
        ]),
      ),
    [teamMembers],
  );

  const selectedTaskType = useMemo(
    () =>
      taskTypes.find(
        (taskType) =>
          taskType.id === selectedTaskTypeId,
      ) ?? null,
    [selectedTaskTypeId, taskTypes],
  );

  function clearTaskTypeMessages() {
    setTaskTypeMessage("");
    setTaskTypeError("");
  }

  function clearSettingsMessages() {
    setSettingsMessage("");
    setSettingsError("");
  }

  function scrollToEditor() {
    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function startNewTaskType() {
    setSelectedTaskTypeId(null);
    setTaskTypeForm({
      ...emptyTaskTypeForm,
    });
    clearTaskTypeMessages();
    scrollToEditor();
  }

  function cancelEditing() {
    setSelectedTaskTypeId(null);
    setTaskTypeForm({
      ...emptyTaskTypeForm,
    });
    clearTaskTypeMessages();
  }

  function editTaskType(taskType: TaskType) {
    setSelectedTaskTypeId(taskType.id);
    setTaskTypeForm(
      getTaskTypeForm(taskType),
    );
    clearTaskTypeMessages();
    scrollToEditor();
  }

  async function saveTaskType(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    clearTaskTypeMessages();

    if (!taskTypeForm.name.trim()) {
      setTaskTypeError(
        "Task type name is required.",
      );
      return;
    }

    const taskKey =
      taskTypeForm.taskKey.trim() ||
      createTaskKey(taskTypeForm.name);

    if (!taskKey) {
      setTaskTypeError(
        "A valid task key is required.",
      );
      return;
    }

    if (
      taskTypeForm.dueMode !==
        "no_due_date" &&
      taskTypeForm.dueMode !== "same_day" &&
      (!Number.isInteger(
        taskTypeForm.dueOffset,
      ) ||
        taskTypeForm.dueOffset < 0 ||
        taskTypeForm.dueOffset > 365)
    ) {
      setTaskTypeError(
        "Enter a whole number of days from 0 to 365.",
      );
      return;
    }

    if (
      taskTypeForm.assignmentStrategy ===
        "specific_employee" &&
      !taskTypeForm.defaultAssigneeId
    ) {
      setTaskTypeError(
        "Choose the specific employee who should receive this task.",
      );
      return;
    }

    setIsSavingTaskType(true);

    try {
      const response = await fetch(
        selectedTaskTypeId
          ? `/api/task-types/${encodeURIComponent(
              selectedTaskTypeId,
            )}`
          : "/api/task-types",
        {
          method: selectedTaskTypeId
            ? "PATCH"
            : "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: taskTypeForm.name,
            taskKey,
            description:
              taskTypeForm.description,
            category:
              taskTypeForm.category,
            defaultPriority:
              taskTypeForm.defaultPriority,
            dueMode: taskTypeForm.dueMode,
            dueOffset:
              taskTypeForm.dueMode ===
                "same_day" ||
              taskTypeForm.dueMode ===
                "no_due_date"
                ? 0
                : taskTypeForm.dueOffset,
            assignmentStrategy:
              taskTypeForm.assignmentStrategy,
            defaultAssigneeId:
              taskTypeForm.assignmentStrategy ===
              "specific_employee"
                ? taskTypeForm.defaultAssigneeId
                : null,
            isActive:
              taskTypeForm.isActive,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          taskType?: TaskType;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success ||
        !result.taskType
      ) {
        throw new Error(
          result.error ??
            "Unable to save task type.",
        );
      }

      if (selectedTaskTypeId) {
        setTaskTypes((current) =>
          current.map((taskType) =>
            taskType.id ===
            selectedTaskTypeId
              ? result.taskType!
              : taskType,
          ),
        );

        setTaskTypeMessage(
          "Task type updated.",
        );
      } else {
        setTaskTypes((current) =>
          [
            ...current,
            result.taskType!,
          ].sort((first, second) =>
            first.name.localeCompare(
              second.name,
            ),
          ),
        );

        setSelectedTaskTypeId(
          result.taskType.id,
        );

        setTaskTypeMessage(
          "Task type added.",
        );
      }

      setTaskTypeForm(
        getTaskTypeForm(result.taskType),
      );

      router.refresh();
    } catch (saveError) {
      setTaskTypeError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save task type.",
      );
    } finally {
      setIsSavingTaskType(false);
    }
  }

  async function toggleTaskTypeStatus(
    taskType: TaskType,
  ) {
    clearTaskTypeMessages();
    setIsSavingTaskType(true);

    try {
      const response = await fetch(
        `/api/task-types/${encodeURIComponent(
          taskType.id,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            isActive: !taskType.is_active,
          }),
        },
      );

      const result =
        (await response.json()) as {
          success?: boolean;
          taskType?: TaskType;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success ||
        !result.taskType
      ) {
        throw new Error(
          result.error ??
            "Unable to update task type.",
        );
      }

      setTaskTypes((current) =>
        current.map(
          (existingTaskType) =>
            existingTaskType.id ===
            taskType.id
              ? result.taskType!
              : existingTaskType,
        ),
      );

      if (
        selectedTaskTypeId === taskType.id
      ) {
        setTaskTypeForm(
          getTaskTypeForm(
            result.taskType,
          ),
        );
      }

      setTaskTypeMessage(
        result.taskType.is_active
          ? "Task type activated."
          : "Task type deactivated.",
      );

      router.refresh();
    } catch (statusError) {
      setTaskTypeError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update task type.",
      );
    } finally {
      setIsSavingTaskType(false);
    }
  }

  async function saveManualDefaults(
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
            manualTaskDueMode:
              "business_days",
            manualTaskDueOffset: 1,
            endOfBusinessTime:
              settings.end_of_business_time,
          }),
        },
      );

      const result =
        (await response.json()) as {
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
            "Unable to save manual task defaults.",
        );
      }

      setSettings(result.settings);
      setSettingsMessage(
        "Manual task defaults saved.",
      );

      router.refresh();
    } catch (saveError) {
      setSettingsError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save manual task defaults.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Manual Tasks
        </p>

        <h2 className="mt-1 text-2xl font-bold text-slate-950">
          Default Manual Task Timing
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Manual tasks default to the next
          business day. The person creating the
          task can choose a different preset or a
          custom date from the Daily Action List.
        </p>

        {!settings ? (
          <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Company settings could not be loaded.
          </p>
        ) : (
          <form
            onSubmit={saveManualDefaults}
            className="mt-6 space-y-5"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Default Due Timing
                </span>

                <input
                  type="text"
                  value="Next business day"
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  End of Business
                </span>

                <input
                  type="time"
                  value={settings.end_of_business_time.slice(
                    0,
                    5,
                  )}
                  onChange={(event) => {
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            end_of_business_time:
                              `${event.target.value}:00`,
                          }
                        : current,
                    );

                    clearSettingsMessages();
                  }}
                  disabled={isSavingSettings}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSavingSettings}
              className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-400"
            >
              {isSavingSettings
                ? "Saving..."
                : "Save Manual Task Defaults"}
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Workflow Rules
            </p>

            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              Task Types
            </h2>

            <p className="mt-2 text-sm text-slate-600">
              Select Edit to change timing,
              priority, category, or assignment.
            </p>
          </div>

          <button
            type="button"
            onClick={startNewTaskType}
            className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
          >
            Add Task Type
          </button>
        </div>

        {taskTypeMessage ? (
          <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {taskTypeMessage}
          </p>
        ) : null}

        {taskTypeError ? (
          <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {taskTypeError}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {taskTypes.length === 0 ? (
            <p className="text-sm text-slate-600">
              No task types have been added.
            </p>
          ) : (
            taskTypes.map((taskType) => (
              <article
                key={taskType.id}
                className={`rounded-xl border p-5 ${
                  selectedTaskTypeId ===
                  taskType.id
                    ? "border-amber-400 bg-amber-50 ring-2 ring-amber-100"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-950">
                      {taskType.name}
                    </h3>

                    <p className="mt-1 break-all text-xs text-slate-500">
                      {taskType.task_key}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      taskType.is_active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {taskType.is_active
                      ? "Active"
                      : "Inactive"}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">
                    {titleCase(
                      taskType.category,
                    )}
                  </span>

                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">
                    {getTimingLabel(taskType)}
                  </span>

                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">
                    {getAssignmentLabel(
                      taskType,
                      teamMemberMap,
                    )}
                  </span>

                  {taskType.is_system_type ? (
                    <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold text-sky-800">
                      System
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      editTaskType(taskType)
                    }
                    disabled={isSavingTaskType}
                    className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void toggleTaskTypeStatus(
                        taskType,
                      )
                    }
                    disabled={isSavingTaskType}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:text-slate-300"
                  >
                    {taskType.is_active
                      ? "Deactivate"
                      : "Activate"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section
        ref={editorRef}
        className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
          Task Type Editor
        </p>

        <h2 className="mt-1 text-2xl font-bold text-slate-950">
          {selectedTaskType
            ? `Edit ${selectedTaskType.name}`
            : "Add Task Type"}
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Configure how this task is categorized,
          prioritized, assigned, and scheduled.
        </p>

        <form
          onSubmit={saveTaskType}
          className="mt-6 space-y-5"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Task Type Name
              </span>

              <input
                type="text"
                value={taskTypeForm.name}
                onChange={(event) => {
                  const name = event.target.value;

                  setTaskTypeForm((current) => ({
                    ...current,
                    name,
                    taskKey:
                      selectedTaskTypeId ||
                      current.taskKey
                        ? current.taskKey
                        : createTaskKey(name),
                  }));

                  clearTaskTypeMessages();
                }}
                disabled={isSavingTaskType}
                placeholder="Prepare Project Photos"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Internal Task Key
              </span>

              <input
                type="text"
                value={taskTypeForm.taskKey}
                onChange={(event) => {
                  setTaskTypeForm((current) => ({
                    ...current,
                    taskKey: createTaskKey(
                      event.target.value,
                    ),
                  }));

                  clearTaskTypeMessages();
                }}
                disabled={
                  isSavingTaskType ||
                  Boolean(
                    selectedTaskType?.is_system_type,
                  )
                }
                placeholder="prepare_project_photos"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Description
            </span>

            <textarea
              value={taskTypeForm.description}
              onChange={(event) => {
                setTaskTypeForm((current) => ({
                  ...current,
                  description:
                    event.target.value,
                }));

                clearTaskTypeMessages();
              }}
              disabled={isSavingTaskType}
              rows={3}
              placeholder="Describe when and why this task is used."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Category
              </span>

              <select
                value={taskTypeForm.category}
                onChange={(event) => {
                  setTaskTypeForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }));

                  clearTaskTypeMessages();
                }}
                disabled={isSavingTaskType}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                {categoryOptions.map(
                  (category) => (
                    <option
                      key={category.value}
                      value={category.value}
                    >
                      {category.label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Default Priority
              </span>

              <select
                value={
                  taskTypeForm.defaultPriority
                }
                onChange={(event) => {
                  setTaskTypeForm((current) => ({
                    ...current,
                    defaultPriority:
                      event.target.value,
                  }));

                  clearTaskTypeMessages();
                }}
                disabled={isSavingTaskType}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                {priorityOptions.map(
                  (priority) => (
                    <option
                      key={priority.value}
                      value={priority.value}
                    >
                      {priority.label}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Default Due Timing
              </span>

              <select
                value={taskTypeForm.dueMode}
                onChange={(event) => {
                  setTaskTypeForm((current) => ({
                    ...current,
                    dueMode: event.target.value,
                    dueOffset:
                      event.target.value ===
                        "same_day" ||
                      event.target.value ===
                        "no_due_date"
                        ? 0
                        : Math.max(
                            current.dueOffset,
                            1,
                          ),
                  }));

                  clearTaskTypeMessages();
                }}
                disabled={isSavingTaskType}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                {dueModeOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Number of Days
              </span>

              <input
                type="number"
                min={0}
                max={365}
                value={taskTypeForm.dueOffset}
                onChange={(event) => {
                  setTaskTypeForm((current) => ({
                    ...current,
                    dueOffset: Number(
                      event.target.value,
                    ),
                  }));

                  clearTaskTypeMessages();
                }}
                disabled={
                  isSavingTaskType ||
                  taskTypeForm.dueMode ===
                    "same_day" ||
                  taskTypeForm.dueMode ===
                    "no_due_date"
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
              />
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Default Assignment
              </span>

              <select
                value={
                  taskTypeForm.assignmentStrategy
                }
                onChange={(event) => {
                  setTaskTypeForm((current) => ({
                    ...current,
                    assignmentStrategy:
                      event.target.value,
                    defaultAssigneeId:
                      event.target.value ===
                      "specific_employee"
                        ? current.defaultAssigneeId
                        : "",
                  }));

                  clearTaskTypeMessages();
                }}
                disabled={isSavingTaskType}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                {assignmentOptions.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Specific Employee
              </span>

              <select
                value={
                  taskTypeForm.defaultAssigneeId
                }
                onChange={(event) => {
                  setTaskTypeForm((current) => ({
                    ...current,
                    defaultAssigneeId:
                      event.target.value,
                  }));

                  clearTaskTypeMessages();
                }}
                disabled={
                  isSavingTaskType ||
                  taskTypeForm.assignmentStrategy !==
                    "specific_employee"
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
              >
                <option value="">
                  Choose employee
                </option>

                {activeTeamMembers.map(
                  (member) => (
                    <option
                      key={member.id}
                      value={member.id}
                    >
                      {member.name}
                      {member.job_title
                        ? ` — ${member.job_title}`
                        : ""}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={taskTypeForm.isActive}
              onChange={(event) => {
                setTaskTypeForm((current) => ({
                  ...current,
                  isActive:
                    event.target.checked,
                }));

                clearTaskTypeMessages();
              }}
              disabled={isSavingTaskType}
              className="mt-1 h-4 w-4"
            />

            <span>
              <span className="block text-sm font-bold text-slate-950">
                Active task type
              </span>

              <span className="mt-1 block text-xs leading-5 text-slate-600">
                Active task types can be used for
                new tasks and workflow automation.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSavingTaskType}
              className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-400"
            >
              {isSavingTaskType
                ? "Saving..."
                : selectedTaskTypeId
                  ? "Save Changes"
                  : "Add Task Type"}
            </button>

            {selectedTaskTypeId ? (
              <button
                type="button"
                onClick={cancelEditing}
                disabled={isSavingTaskType}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 disabled:text-slate-300"
              >
                Cancel Editing
              </button>
            ) : null}
          </div>

          {taskTypeMessage ? (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {taskTypeMessage}
            </p>
          ) : null}

          {taskTypeError ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {taskTypeError}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}