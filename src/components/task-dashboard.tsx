"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  task_type: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  completion_note: string | null;
  assigned_to_id: string | null;
  assigned_at: string | null;
  lead_id: string | null;
  project_id: string | null;
  customer_id: string | null;
  recurrence_rule: string | null;
  source_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  roles: string[] | null;
  status: string;
};

type Lead = {
  id: string | number;
  name: string | null;
  project_type: string | null;
  property_address: string | null;
  lead_status: string | null;
};

type TaskDashboardProps = {
  initialTasks: Task[];
  teamMembers: TeamMember[];
  leads: Lead[];
};

type TaskFormState = {
  title: string;
  description: string;
  category: string;
  priority: string;
  dueOption: string;
  customDueDate: string;
  assignedToId: string;
  leadId: string;
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

const dueOptions = [
  {
    value: "next_business_day",
    label: "Next business day",
  },
  { value: "same_day", label: "Same day" },
  {
    value: "2_business_days",
    label: "2 business days",
  },
  {
    value: "3_business_days",
    label: "3 business days",
  },
  {
    value: "5_business_days",
    label: "5 business days",
  },
  {
    value: "7_calendar_days",
    label: "7 calendar days",
  },
  {
    value: "14_calendar_days",
    label: "14 calendar days",
  },
  {
    value: "30_calendar_days",
    label: "30-day follow-up",
  },
  {
    value: "60_calendar_days",
    label: "60-day follow-up",
  },
  {
    value: "custom_date",
    label: "Custom date",
  },
  {
    value: "no_due_date",
    label: "No due date",
  },
];

const emptyTaskForm: TaskFormState = {
  title: "",
  description: "",
  category: "administrative",
  priority: "normal",
  dueOption: "next_business_day",
  customDueDate: "",
  assignedToId: "",
  leadId: "",
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getLocalDateKey(value: string | Date) {
  const date =
    typeof value === "string"
      ? new Date(value)
      : value;

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year =
    parts.find((part) => part.type === "year")
      ?.value ?? "";

  const month =
    parts.find((part) => part.type === "month")
      ?.value ?? "";

  const day =
    parts.find((part) => part.type === "day")
      ?.value ?? "";

  return `${year}-${month}-${day}`;
}

function getTodayKey() {
  return getLocalDateKey(new Date());
}

function formatDate(value: string | null) {
  if (!value) {
    return "No due date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getPriorityClasses(priority: string) {
  if (priority === "urgent") {
    return "bg-red-100 text-red-800";
  }

  if (priority === "high") {
    return "bg-orange-100 text-orange-800";
  }

  if (priority === "low") {
    return "bg-slate-100 text-slate-700";
  }

  return "bg-sky-100 text-sky-800";
}

function getCategoryClasses(category: string) {
  if (category === "sales") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (category === "project") {
    return "bg-violet-100 text-violet-800";
  }

  if (category === "marketing") {
    return "bg-pink-100 text-pink-800";
  }

  if (category === "accounting") {
    return "bg-amber-100 text-amber-800";
  }

  if (category === "operations") {
    return "bg-cyan-100 text-cyan-800";
  }

  if (category === "customer_service") {
    return "bg-indigo-100 text-indigo-800";
  }

  if (category === "owner") {
    return "bg-slate-950 text-white";
  }

  return "bg-slate-200 text-slate-800";
}

function addBusinessDays(
  startingDate: Date,
  numberOfDays: number,
) {
  const date = new Date(startingDate);
  let daysAdded = 0;

  while (daysAdded < numberOfDays) {
    date.setDate(date.getDate() + 1);

    const dayOfWeek = date.getDay();

    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded += 1;
    }
  }

  return date;
}

function setEndOfBusiness(date: Date) {
  const endOfBusiness = new Date(date);

  endOfBusiness.setHours(17, 0, 0, 0);

  return endOfBusiness;
}

function createDueAt(
  dueOption: string,
  customDueDate: string,
) {
  const today = new Date();

  if (dueOption === "no_due_date") {
    return null;
  }

  if (dueOption === "same_day") {
    return setEndOfBusiness(today).toISOString();
  }

  if (dueOption === "next_business_day") {
    return setEndOfBusiness(
      addBusinessDays(today, 1),
    ).toISOString();
  }

  if (dueOption === "2_business_days") {
    return setEndOfBusiness(
      addBusinessDays(today, 2),
    ).toISOString();
  }

  if (dueOption === "3_business_days") {
    return setEndOfBusiness(
      addBusinessDays(today, 3),
    ).toISOString();
  }

  if (dueOption === "5_business_days") {
    return setEndOfBusiness(
      addBusinessDays(today, 5),
    ).toISOString();
  }

  if (dueOption === "7_calendar_days") {
    const date = new Date(today);

    date.setDate(date.getDate() + 7);

    return setEndOfBusiness(date).toISOString();
  }

  if (dueOption === "14_calendar_days") {
    const date = new Date(today);

    date.setDate(date.getDate() + 14);

    return setEndOfBusiness(date).toISOString();
  }

  if (dueOption === "30_calendar_days") {
    const date = new Date(today);

    date.setDate(date.getDate() + 30);

    return setEndOfBusiness(date).toISOString();
  }

  if (dueOption === "60_calendar_days") {
    const date = new Date(today);

    date.setDate(date.getDate() + 60);

    return setEndOfBusiness(date).toISOString();
  }

  if (
    dueOption === "custom_date" &&
    customDueDate
  ) {
    const date = new Date(
      `${customDueDate}T12:00:00`,
    );

    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return setEndOfBusiness(date).toISOString();
  }

  return undefined;
}

export default function TaskDashboard({
  initialTasks,
  teamMembers,
  leads,
}: TaskDashboardProps) {
  const router = useRouter();

  const [tasks, setTasks] =
    useState(initialTasks);

  const [taskForm, setTaskForm] =
    useState<TaskFormState>(emptyTaskForm);

  const [categoryFilter, setCategoryFilter] =
    useState("all");

  const [assigneeFilter, setAssigneeFilter] =
    useState("all");

  const [showAddTask, setShowAddTask] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [updatingTaskId, setUpdatingTaskId] =
    useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeTeamMembers = useMemo(
    () =>
      teamMembers.filter(
        (member) => member.status === "active",
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

  const leadMap = useMemo(
    () =>
      new Map(
        leads.map((lead) => [
          String(lead.id),
          lead,
        ]),
      ),
    [leads],
  );

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (
          categoryFilter !== "all" &&
          task.category !== categoryFilter
        ) {
          return false;
        }

        if (
          assigneeFilter === "unassigned" &&
          task.assigned_to_id
        ) {
          return false;
        }

        if (
          assigneeFilter !== "all" &&
          assigneeFilter !== "unassigned" &&
          task.assigned_to_id !== assigneeFilter
        ) {
          return false;
        }

        return true;
      }),
    [
      tasks,
      categoryFilter,
      assigneeFilter,
    ],
  );

  const todayKey = getTodayKey();

  const overdueTasks = useMemo(
    () =>
      filteredTasks.filter((task) => {
        if (
          !task.due_at ||
          !["open", "in_progress"].includes(
            task.status,
          )
        ) {
          return false;
        }

        return (
          getLocalDateKey(task.due_at) <
          todayKey
        );
      }),
    [filteredTasks, todayKey],
  );

  const todayTasks = useMemo(
    () =>
      filteredTasks.filter((task) => {
        if (
          !task.due_at ||
          !["open", "in_progress"].includes(
            task.status,
          )
        ) {
          return false;
        }

        return (
          getLocalDateKey(task.due_at) ===
          todayKey
        );
      }),
    [filteredTasks, todayKey],
  );

  const upcomingTasks = useMemo(
    () =>
      filteredTasks.filter((task) => {
        if (
          !task.due_at ||
          !["open", "in_progress"].includes(
            task.status,
          )
        ) {
          return false;
        }

        return (
          getLocalDateKey(task.due_at) >
          todayKey
        );
      }),
    [filteredTasks, todayKey],
  );

  const unscheduledTasks = useMemo(
    () =>
      filteredTasks.filter(
        (task) =>
          !task.due_at &&
          ["open", "in_progress"].includes(
            task.status,
          ),
      ),
    [filteredTasks],
  );

  const completedTodayTasks = useMemo(
    () =>
      filteredTasks.filter(
        (task) =>
          task.status === "completed" &&
          task.completed_at &&
          getLocalDateKey(task.completed_at) ===
            todayKey,
      ),
    [filteredTasks, todayKey],
  );

  function clearMessages() {
    setMessage("");
    setError("");
  }

  async function createTask(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    clearMessages();

    if (!taskForm.title.trim()) {
      setError("Task title is required.");
      return;
    }

    const dueAt = createDueAt(
      taskForm.dueOption,
      taskForm.customDueDate,
    );

    if (dueAt === undefined) {
      setError(
        "Choose a valid custom due date.",
      );
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch(
        "/api/tasks",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            title: taskForm.title,
            description:
              taskForm.description,
            category:
              taskForm.category,
            priority:
              taskForm.priority,
            dueAt,
            assignedToId:
              taskForm.assignedToId || null,
            leadId:
              taskForm.leadId || null,
          }),
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        task?: Task;
        error?: string;
      };

      if (
        !response.ok ||
        !result.success ||
        !result.task
      ) {
        throw new Error(
          result.error ??
            "Unable to create task.",
        );
      }

      setTasks((current) => [
        ...current,
        result.task!,
      ]);

      setTaskForm(emptyTaskForm);
      setShowAddTask(false);
      setMessage("Task added.");
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to create task.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTaskStatus(
    taskId: string,
    status: string,
  ) {
    clearMessages();
    setUpdatingTaskId(taskId);

    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(
          taskId,
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status,
          }),
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        task?: Task;
        error?: string;
      };

      if (
        !response.ok ||
        !result.success ||
        !result.task
      ) {
        throw new Error(
          result.error ??
            "Unable to update task.",
        );
      }

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? result.task!
            : task,
        ),
      );

      setMessage(
        status === "completed"
          ? "Task completed."
          : status === "in_progress"
            ? "Task started."
            : status === "canceled"
              ? "Task canceled."
              : "Task reopened.",
      );

      router.refresh();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update task.",
      );
    } finally {
      setUpdatingTaskId(null);
    }
  }

  function getTaskDestination(task: Task) {
    if (!task.lead_id) {
      return null;
    }

    const anchor =
      task.task_type ===
      "review_follow_up_email"
        ? "#email-draft-review"
        : "#lead-workflow";

    return `/admin/leads/${encodeURIComponent(
      task.lead_id,
    )}${anchor}`;
  }

  function openTask(task: Task) {
    const destination =
      getTaskDestination(task);

    if (destination) {
      router.push(destination);
    }
  }

  function renderTaskCard(
    task: Task,
    context:
      | "overdue"
      | "today"
      | "upcoming"
      | "unscheduled"
      | "completed",
  ) {
    const assignee = task.assigned_to_id
      ? teamMemberMap.get(task.assigned_to_id)
      : null;

    const relatedLead = task.lead_id
      ? leadMap.get(task.lead_id)
      : null;

    const isUpdating =
      updatingTaskId === task.id;

    return (
      <article
        key={task.id}
        className={`rounded-xl border p-4 ${
          context === "overdue"
            ? "border-red-300 bg-red-50"
            : context === "today"
              ? "border-amber-300 bg-amber-50"
              : context === "completed"
                ? "border-emerald-200 bg-emerald-50"
                : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getCategoryClasses(
                  task.category,
                )}`}
              >
                {titleCase(task.category)}
              </span>

              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getPriorityClasses(
                  task.priority,
                )}`}
              >
                {titleCase(task.priority)}
              </span>

              {task.status ===
              "in_progress" ? (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                  In Progress
                </span>
              ) : null}
            </div>

            {getTaskDestination(task) ? (
              <button
                type="button"
                onClick={() => openTask(task)}
                className="mt-3 block text-left text-base font-bold text-slate-950 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-600"
              >
                {task.title}
              </button>
            ) : (
              <h3 className="mt-3 text-base font-bold text-slate-950">
                {task.title}
              </h3>
            )}

            {task.description ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {task.description}
              </p>
            ) : null}

            <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
              <p>
                <span className="font-bold text-slate-800">
                  Due:
                </span>{" "}
                {formatDate(task.due_at)}
              </p>

              <p>
                <span className="font-bold text-slate-800">
                  Assigned:
                </span>{" "}
                {assignee?.name ?? "Unassigned"}
              </p>
            </div>

            {relatedLead ? (
              <button
                type="button"
                onClick={() =>
                  openTask(task)
                }
                className="mt-3 block w-full cursor-pointer rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-left text-xs text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                <span className="font-bold">
                  Related lead:
                </span>{" "}
                <span className="font-semibold underline decoration-slate-300 underline-offset-4">
                  {relatedLead.name ??
                    "Unnamed lead"}
                </span>

                {relatedLead.project_type
                  ? ` — ${relatedLead.project_type}`
                  : ""}

                <span className="ml-2 font-bold text-slate-500">
                  Open Task →
                </span>
              </button>
            ) : null}

            {context === "completed" ? (
              <p className="mt-3 text-xs font-semibold text-emerald-800">
                Completed today
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {context !== "completed" ? (
              <>
                {task.status === "open" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void updateTaskStatus(
                        task.id,
                        "in_progress",
                      )
                    }
                    disabled={isUpdating}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:text-slate-300"
                  >
                    Start
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() =>
                    void updateTaskStatus(
                      task.id,
                      "completed",
                    )
                  }
                  disabled={isUpdating}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:bg-emerald-300"
                >
                  Complete
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void updateTaskStatus(
                      task.id,
                      "canceled",
                    )
                  }
                  disabled={isUpdating}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:text-slate-300"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() =>
                  void updateTaskStatus(
                    task.id,
                    "open",
                  )
                }
                disabled={isUpdating}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:text-slate-300"
              >
                Reopen
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  function renderTaskSection(
    title: string,
    description: string,
    sectionTasks: Task[],
    context:
      | "overdue"
      | "today"
      | "upcoming"
      | "unscheduled"
      | "completed",
  ) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              {title}
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              {description}
            </p>
          </div>

          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
            {sectionTasks.length}
          </span>
        </div>

        {sectionTasks.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No tasks in this section.
          </p>
        ) : (
          <div className="mt-5 space-y-3">
            {sectionTasks.map((task) =>
              renderTaskCard(task, context),
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-red-700">
            Overdue
          </p>

          <p className="mt-2 text-3xl font-bold text-red-900">
            {overdueTasks.length}
          </p>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Due Today
          </p>

          <p className="mt-2 text-3xl font-bold text-amber-900">
            {todayTasks.length}
          </p>
        </article>

        <article className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-700">
            Upcoming
          </p>

          <p className="mt-2 text-3xl font-bold text-sky-900">
            {upcomingTasks.length}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Unscheduled
          </p>

          <p className="mt-2 text-3xl font-bold text-slate-950">
            {unscheduledTasks.length}
          </p>
        </article>

        <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
            Completed Today
          </p>

          <p className="mt-2 text-3xl font-bold text-emerald-900">
            {completedTodayTasks.length}
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Daily View
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-950">
              Filter Tasks
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowAddTask(
                (current) => !current,
              );
              clearMessages();
            }}
            className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white"
          >
            {showAddTask
              ? "Close Task Form"
              : "Add Task"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Filter by Category
            </span>

            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value,
                )
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              <option value="all">
                All Categories
              </option>

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
              Filter by Employee
            </span>

            <select
              value={assigneeFilter}
              onChange={(event) =>
                setAssigneeFilter(
                  event.target.value,
                )
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              <option value="all">
                Everyone
              </option>

              <option value="unassigned">
                Unassigned
              </option>

              {activeTeamMembers.map(
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

        {showAddTask ? (
          <form
            onSubmit={createTask}
            className="mt-6 space-y-5 border-t border-slate-200 pt-6"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Task
                </span>

                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(event) => {
                    setTaskForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }));
                    clearMessages();
                  }}
                  disabled={isSaving}
                  placeholder="Reconcile bank account"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Category
                </span>

                <select
                  value={taskForm.category}
                  onChange={(event) => {
                    setTaskForm((current) => ({
                      ...current,
                      category:
                        event.target.value,
                    }));
                    clearMessages();
                  }}
                  disabled={isSaving}
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
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Description
              </span>

              <textarea
                value={taskForm.description}
                onChange={(event) => {
                  setTaskForm((current) => ({
                    ...current,
                    description:
                      event.target.value,
                  }));
                  clearMessages();
                }}
                disabled={isSaving}
                rows={3}
                placeholder="Optional instructions or notes"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            </label>

            <div className="grid gap-5 md:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Due
                </span>

                <select
                  value={taskForm.dueOption}
                  onChange={(event) => {
                    setTaskForm((current) => ({
                      ...current,
                      dueOption:
                        event.target.value,
                      customDueDate:
                        event.target.value ===
                        "custom_date"
                          ? current.customDueDate
                          : "",
                    }));
                    clearMessages();
                  }}
                  disabled={isSaving}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                >
                  {dueOptions.map((option) => (
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
                  Priority
                </span>

                <select
                  value={taskForm.priority}
                  onChange={(event) => {
                    setTaskForm((current) => ({
                      ...current,
                      priority:
                        event.target.value,
                    }));
                    clearMessages();
                  }}
                  disabled={isSaving}
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

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Assign Task To
                </span>

                <select
                  value={
                    taskForm.assignedToId
                  }
                  onChange={(event) => {
                    setTaskForm((current) => ({
                      ...current,
                      assignedToId:
                        event.target.value,
                    }));
                    clearMessages();
                  }}
                  disabled={isSaving}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                >
                  <option value="">
                    Unassigned
                  </option>

                  {activeTeamMembers.map(
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

            {taskForm.dueOption ===
            "custom_date" ? (
              <label className="block max-w-sm">
                <span className="mb-2 block text-sm font-bold text-slate-950">
                  Custom Due Date
                </span>

                <input
                  type="date"
                  value={
                    taskForm.customDueDate
                  }
                  onChange={(event) => {
                    setTaskForm((current) => ({
                      ...current,
                      customDueDate:
                        event.target.value,
                    }));
                    clearMessages();
                  }}
                  disabled={isSaving}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-950">
                Related Lead
              </span>

              <select
                value={taskForm.leadId}
                onChange={(event) => {
                  setTaskForm((current) => ({
                    ...current,
                    leadId:
                      event.target.value,
                  }));
                  clearMessages();
                }}
                disabled={isSaving}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                <option value="">
                  No related lead
                </option>

                {leads.map((lead) => (
                  <option
                    key={String(lead.id)}
                    value={String(lead.id)}
                  >
                    {lead.name ??
                      "Unnamed lead"}
                    {lead.project_type
                      ? ` — ${lead.project_type}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-400"
            >
              {isSaving
                ? "Adding Task..."
                : "Add Task"}
            </button>
          </form>
        ) : null}

        {message ? (
          <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {renderTaskSection(
        "Overdue",
        "Incomplete work that was due before today.",
        overdueTasks,
        "overdue",
      )}

      {renderTaskSection(
        "Today",
        "Your company-wide checklist for today.",
        todayTasks,
        "today",
      )}

      {renderTaskSection(
        "Upcoming",
        "Scheduled work due after today.",
        upcomingTasks,
        "upcoming",
      )}

      {renderTaskSection(
        "Unscheduled",
        "Open work that does not yet have a due date.",
        unscheduledTasks,
        "unscheduled",
      )}

      {renderTaskSection(
        "Completed Today",
        "Work completed during the current day.",
        completedTodayTasks,
        "completed",
      )}
    </div>
  );
}