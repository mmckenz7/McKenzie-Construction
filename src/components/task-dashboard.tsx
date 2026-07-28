"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  task_type: string | null;
  task_type_id: string | null;
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
  recurrenceRule: string;
};

type GoogleTaskTemplate = {
  automationKey: string;
  title: string;
  description: string;
  recurrenceRule: "daily" | "weekly" | "monthly";
  priority: string;
  dueAt: string;
};

const categoryOptions = [
  { value: "sales", label: "Sales" },
  { value: "project", label: "Project" },
  { value: "marketing", label: "Marketing" },
  { value: "accounting", label: "Accounting" },
  { value: "operations", label: "Operations" },
  { value: "customer_service", label: "Customer Service" },
  { value: "administrative", label: "Administrative" },
  { value: "owner", label: "Owner" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const recurrenceOptions = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const dueOptions = [
  { value: "next_business_day", label: "Next business day" },
  { value: "same_day", label: "Same day" },
  { value: "2_business_days", label: "2 business days" },
  { value: "3_business_days", label: "3 business days" },
  { value: "5_business_days", label: "5 business days" },
  { value: "7_calendar_days", label: "7 calendar days" },
  { value: "14_calendar_days", label: "14 calendar days" },
  { value: "30_calendar_days", label: "30-day follow-up" },
  { value: "60_calendar_days", label: "60-day follow-up" },
  { value: "custom_date", label: "Custom date" },
  { value: "no_due_date", label: "No due date" },
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
  recurrenceRule: "none",
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getLocalDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

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

function addBusinessDays(startingDate: Date, numberOfDays: number) {
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
  const result = new Date(date);
  result.setHours(17, 0, 0, 0);
  return result;
}

function setTaskTime(date: Date, hour: number) {
  const result = new Date(date);
  result.setHours(hour, 0, 0, 0);
  return result;
}

function createDueAt(dueOption: string, customDueDate: string) {
  const today = new Date();

  if (dueOption === "no_due_date") {
    return null;
  }

  if (dueOption === "same_day") {
    return setEndOfBusiness(today).toISOString();
  }

  const businessDayMap: Record<string, number> = {
    next_business_day: 1,
    "2_business_days": 2,
    "3_business_days": 3,
    "5_business_days": 5,
  };

  if (businessDayMap[dueOption]) {
    return setEndOfBusiness(
      addBusinessDays(today, businessDayMap[dueOption]),
    ).toISOString();
  }

  const calendarDayMap: Record<string, number> = {
    "7_calendar_days": 7,
    "14_calendar_days": 14,
    "30_calendar_days": 30,
    "60_calendar_days": 60,
  };

  if (calendarDayMap[dueOption]) {
    const date = new Date(today);
    date.setDate(date.getDate() + calendarDayMap[dueOption]);
    return setEndOfBusiness(date).toISOString();
  }

  if (dueOption === "custom_date" && customDueDate) {
    const date = new Date(`${customDueDate}T12:00:00`);

    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    return setEndOfBusiness(date).toISOString();
  }

  return undefined;
}

function getNextWeekday(weekday: number) {
  const date = new Date();
  const currentWeekday = date.getDay();

  let daysUntil = (weekday - currentWeekday + 7) % 7;

  if (daysUntil === 0) {
    daysUntil = 7;
  }

  date.setDate(date.getDate() + daysUntil);

  return setTaskTime(date, 16);
}

function getNextMonthDate(dayOfMonth: number) {
  const date = new Date();

  date.setDate(1);
  date.setMonth(date.getMonth() + 1);

  const finalDayOfMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();

  date.setDate(Math.min(dayOfMonth, finalDayOfMonth));

  return setTaskTime(date, 16);
}

function getGoogleTaskTemplates(): GoogleTaskTemplate[] {
  return [
    {
      automationKey: "google_profile_daily_check",
      title: "Check Google Business Profile",
      description:
        "Check for new reviews, customer questions, messages, photo issues, rejected edits, verification notices, or profile changes. Respond to anything that needs attention.",
      recurrenceRule: "daily",
      priority: "normal",
      dueAt: setTaskTime(new Date(), 16).toISOString(),
    },
    {
      automationKey: "google_profile_weekly_post",
      title: "Publish Google Business Profile post",
      description:
        "Publish one useful Google Business Profile update featuring a project, construction tip, availability update, before-and-after result, or link to a relevant website page.",
      recurrenceRule: "weekly",
      priority: "normal",
      dueAt: getNextWeekday(1).toISOString(),
    },
    {
      automationKey: "google_profile_weekly_photos",
      title: "Upload new project photos to Google",
      description:
        "Upload 2–5 strong real project photos. Prioritize finished work, wide project views, before-and-after comparisons, construction details, and clean progress photos.",
      recurrenceRule: "weekly",
      priority: "normal",
      dueAt: getNextWeekday(3).toISOString(),
    },
    {
      automationKey: "google_profile_weekly_reviews",
      title: "Request customer reviews",
      description:
        "Ask eligible past or recently completed customers for an honest Google review. Do not offer discounts, gifts, or other incentives.",
      recurrenceRule: "weekly",
      priority: "high",
      dueAt: getNextWeekday(5).toISOString(),
    },
    {
      automationKey: "google_profile_monthly_audit",
      title: "Audit Google Business Profile",
      description:
        "Review business category, services, service areas, hours, phone number, website, description, photos, profile completeness, and any Google-suggested edits.",
      recurrenceRule: "monthly",
      priority: "normal",
      dueAt: getNextMonthDate(1).toISOString(),
    },
    {
      automationKey: "search_console_monthly_review",
      title: "Review Google Search Console",
      description:
        "Review search impressions, clicks, ranking queries, indexed pages, sitemap status, page indexing issues, mobile usability, and any search enhancements or warnings.",
      recurrenceRule: "monthly",
      priority: "normal",
      dueAt: getNextMonthDate(15).toISOString(),
    },
  ];
}

function getAutomationKey(task: Task) {
  const value = task.metadata?.automation_key;
  return typeof value === "string" ? value : null;
}

function getEditForm(task: Task): TaskFormState {
  return {
    title: task.title,
    description: task.description ?? "",
    category: task.category,
    priority: task.priority,
    dueOption: task.due_at ? "custom_date" : "no_due_date",
    customDueDate: task.due_at ? getLocalDateKey(task.due_at) : "",
    assignedToId: task.assigned_to_id ?? "",
    leadId: task.lead_id ?? "",
    recurrenceRule: task.recurrence_rule ?? "none",
  };
}

export default function TaskDashboard({
  initialTasks,
  teamMembers,
  leads,
}: TaskDashboardProps) {
  const router = useRouter();

  const [tasks, setTasks] = useState(initialTasks);
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm);
  const [editForm, setEditForm] = useState<TaskFormState>(emptyTaskForm);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isAddingGoogleTasks, setIsAddingGoogleTasks] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeTeamMembers = useMemo(
    () => teamMembers.filter((member) => member.status === "active"),
    [teamMembers],
  );

  const teamMemberMap = useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member])),
    [teamMembers],
  );

  const leadMap = useMemo(
    () => new Map(leads.map((lead) => [String(lead.id), lead])),
    [leads],
  );

  const existingAutomationKeys = useMemo(
    () =>
      new Set(
        tasks
          .map(getAutomationKey)
          .filter((value): value is string => Boolean(value)),
      ),
    [tasks],
  );

  const googleTaskTemplates = useMemo(() => getGoogleTaskTemplates(), []);

  const missingGoogleTaskTemplates = useMemo(
    () =>
      googleTaskTemplates.filter(
        (template) =>
          !existingAutomationKeys.has(template.automationKey),
      ),
    [googleTaskTemplates, existingAutomationKeys],
  );

  const googleTasksConfigured = missingGoogleTaskTemplates.length === 0;

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
    [tasks, categoryFilter, assigneeFilter],
  );

  const todayKey = getTodayKey();

  const overdueTasks = useMemo(
    () =>
      filteredTasks.filter(
        (task) =>
          Boolean(task.due_at) &&
          ["open", "in_progress"].includes(task.status) &&
          getLocalDateKey(task.due_at!) < todayKey,
      ),
    [filteredTasks, todayKey],
  );

  const todayTasks = useMemo(
    () =>
      filteredTasks.filter(
        (task) =>
          Boolean(task.due_at) &&
          ["open", "in_progress"].includes(task.status) &&
          getLocalDateKey(task.due_at!) === todayKey,
      ),
    [filteredTasks, todayKey],
  );

  const upcomingTasks = useMemo(
    () =>
      filteredTasks.filter(
        (task) =>
          Boolean(task.due_at) &&
          ["open", "in_progress"].includes(task.status) &&
          getLocalDateKey(task.due_at!) > todayKey,
      ),
    [filteredTasks, todayKey],
  );

  const unscheduledTasks = useMemo(
    () =>
      filteredTasks.filter(
        (task) =>
          !task.due_at &&
          ["open", "in_progress"].includes(task.status),
      ),
    [filteredTasks],
  );

  const completedTodayTasks = useMemo(
    () =>
      filteredTasks.filter(
        (task) =>
          task.status === "completed" &&
          Boolean(task.completed_at) &&
          getLocalDateKey(task.completed_at!) === todayKey,
      ),
    [filteredTasks, todayKey],
  );

  function clearMessages() {
    setMessage("");
    setError("");
  }

  function beginEditing(task: Task) {
    clearMessages();
    setEditingTaskId(task.id);
    setEditForm(getEditForm(task));
  }

  function cancelEditing() {
    setEditingTaskId(null);
    setEditForm(emptyTaskForm);
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
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
      setError("Choose a valid custom due date.");
      return;
    }

    if (
      taskForm.recurrenceRule !== "none" &&
      !dueAt
    ) {
      setError("Recurring tasks require a due date.");
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: taskForm.title,
          description: taskForm.description,
          category: taskForm.category,
          priority: taskForm.priority,
          dueAt,
          assignedToId: taskForm.assignedToId || null,
          leadId: taskForm.leadId || null,
          recurrenceRule: taskForm.recurrenceRule,
        }),
      });

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
          result.error ?? "Unable to create task.",
        );
      }

      setTasks((current) => [...current, result.task!]);
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

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingTaskId) {
      return;
    }

    clearMessages();

    if (!editForm.title.trim()) {
      setError("Task title is required.");
      return;
    }

    const dueAt = createDueAt(
      editForm.dueOption,
      editForm.customDueDate,
    );

    if (dueAt === undefined) {
      setError("Choose a valid custom due date.");
      return;
    }

    if (
      editForm.recurrenceRule !== "none" &&
      !dueAt
    ) {
      setError("Recurring tasks require a due date.");
      return;
    }

    setIsSaving(true);
    setUpdatingTaskId(editingTaskId);

    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(editingTaskId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: editForm.title,
            description: editForm.description,
            category: editForm.category,
            priority: editForm.priority,
            dueAt,
            assignedToId: editForm.assignedToId || null,
            leadId: editForm.leadId || null,
            recurrenceRule: editForm.recurrenceRule,
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
          result.error ?? "Unable to save task.",
        );
      }

      setTasks((current) =>
        current.map((task) =>
          task.id === editingTaskId
            ? result.task!
            : task,
        ),
      );

      setEditingTaskId(null);
      setEditForm(emptyTaskForm);
      setMessage("Task updated.");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save task.",
      );
    } finally {
      setIsSaving(false);
      setUpdatingTaskId(null);
    }
  }

  async function addGoogleTasks() {
    clearMessages();

    if (googleTasksConfigured) {
      setMessage("Google marketing tasks are already configured.");
      return;
    }

    setIsAddingGoogleTasks(true);

    const createdTasks: Task[] = [];

    try {
      for (const template of missingGoogleTaskTemplates) {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: template.title,
            description: template.description,
            category: "marketing",
            priority: template.priority,
            dueAt: template.dueAt,
            assignedToId: null,
            leadId: null,
            recurrenceRule: template.recurrenceRule,
            sourceType: "google_marketing",
            metadata: {
              automation_key: template.automationKey,
              platform: template.automationKey.startsWith(
                "search_console",
              )
                ? "google_search_console"
                : "google_business_profile",
            },
          }),
        });

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
              `Unable to create "${template.title}".`,
          );
        }

        createdTasks.push(result.task);
      }

      setTasks((current) => [...current, ...createdTasks]);
      setMessage(
        `${createdTasks.length} Google marketing tasks added.`,
      );
      router.refresh();
    } catch (creationError) {
      if (createdTasks.length > 0) {
        setTasks((current) => [...current, ...createdTasks]);
      }

      setError(
        creationError instanceof Error
          ? creationError.message
          : "Unable to add Google marketing tasks.",
      );

      router.refresh();
    } finally {
      setIsAddingGoogleTasks(false);
    }
  }

  async function updateTaskStatus(taskId: string, status: string) {
    clearMessages();
    setUpdatingTaskId(taskId);

    try {
      const response = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      );

      const result = (await response.json()) as {
        success?: boolean;
        task?: Task;
        nextTask?: Task | null;
        recurrenceWarning?: string | null;
        error?: string;
      };

      if (
        !response.ok ||
        !result.success ||
        !result.task
      ) {
        throw new Error(
          result.error ?? "Unable to update task.",
        );
      }

      setTasks((current) => {
        const updatedTasks = current.map((task) =>
          task.id === taskId ? result.task! : task,
        );

        if (
          result.nextTask &&
          !updatedTasks.some(
            (task) => task.id === result.nextTask!.id,
          )
        ) {
          return [...updatedTasks, result.nextTask];
        }

        return updatedTasks;
      });

      if (
        status === "completed" &&
        result.nextTask
      ) {
        setMessage(
          `Task completed. Next occurrence scheduled for ${formatDate(
            result.nextTask.due_at,
          )}.`,
        );
      } else if (result.recurrenceWarning) {
        setMessage(
          `Task completed, but the next occurrence could not be created: ${result.recurrenceWarning}`,
        );
      } else {
        setMessage(
          status === "completed"
            ? "Task completed."
            : status === "in_progress"
              ? "Task started."
              : status === "canceled"
                ? "Task canceled."
                : "Task reopened.",
        );
      }

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
      task.task_type === "review_follow_up_email"
        ? "#email-draft-review"
        : "#lead-workflow";

    return `/admin/leads/${encodeURIComponent(
      task.lead_id,
    )}${anchor}`;
  }

  function renderTaskForm(
    form: TaskFormState,
    setForm: React.Dispatch<React.SetStateAction<TaskFormState>>,
    mode: "create" | "edit",
  ) {
    return (
      <>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Task
            </span>

            <input
              type="text"
              value={form.title}
              onChange={(event) => {
                setForm((current) => ({
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
              value={form.category}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  category: event.target.value,
                }));
                clearMessages();
              }}
              disabled={isSaving}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              {categoryOptions.map((category) => (
                <option
                  key={category.value}
                  value={category.value}
                >
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-950">
            Description
          </span>

          <textarea
            value={form.description}
            onChange={(event) => {
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }));
              clearMessages();
            }}
            disabled={isSaving}
            rows={3}
            placeholder="Optional instructions or notes"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
          />
        </label>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Due
            </span>

            <select
              value={form.dueOption}
              onChange={(event) => {
                const dueOption = event.target.value;

                setForm((current) => ({
                  ...current,
                  dueOption,
                  customDueDate:
                    dueOption === "custom_date"
                      ? current.customDueDate
                      : "",
                  recurrenceRule:
                    dueOption === "no_due_date"
                      ? "none"
                      : current.recurrenceRule,
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
              Repeat
            </span>

            <select
              value={form.recurrenceRule}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  recurrenceRule: event.target.value,
                }));
                clearMessages();
              }}
              disabled={
                isSaving ||
                form.dueOption === "no_due_date"
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
            >
              {recurrenceOptions.map((option) => (
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
              value={form.priority}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  priority: event.target.value,
                }));
                clearMessages();
              }}
              disabled={isSaving}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              {priorityOptions.map((priority) => (
                <option
                  key={priority.value}
                  value={priority.value}
                >
                  {priority.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Assign Task To
            </span>

            <select
              value={form.assignedToId}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  assignedToId: event.target.value,
                }));
                clearMessages();
              }}
              disabled={isSaving}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              <option value="">Unassigned</option>

              {activeTeamMembers.map((member) => (
                <option
                  key={member.id}
                  value={member.id}
                >
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {form.dueOption === "custom_date" ? (
          <label className="block max-w-sm">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Custom Due Date
            </span>

            <input
              type="date"
              value={form.customDueDate}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  customDueDate: event.target.value,
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
            value={form.leadId}
            onChange={(event) => {
              setForm((current) => ({
                ...current,
                leadId: event.target.value,
              }));
              clearMessages();
            }}
            disabled={isSaving}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
          >
            <option value="">No related lead</option>

            {leads.map((lead) => (
              <option
                key={String(lead.id)}
                value={String(lead.id)}
              >
                {lead.name ?? "Unnamed lead"}
                {lead.project_type
                  ? ` — ${lead.project_type}`
                  : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-400"
          >
            {isSaving
              ? mode === "edit"
                ? "Saving Changes..."
                : "Adding Task..."
              : mode === "edit"
                ? "Save Changes"
                : "Add Task"}
          </button>

          {mode === "edit" ? (
            <button
              type="button"
              onClick={cancelEditing}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700"
            >
              Cancel Editing
            </button>
          ) : null}
        </div>
      </>
    );
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

    const isUpdating = updatingTaskId === task.id;
    const isEditing = editingTaskId === task.id;
    const destination = getTaskDestination(task);

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
        {isEditing ? (
          <form
            onSubmit={saveTask}
            className="space-y-5"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  Editing Task
                </p>

                <h3 className="mt-1 text-lg font-bold text-slate-950">
                  {task.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
              >
                Close
              </button>
            </div>

            {renderTaskForm(
              editForm,
              setEditForm,
              "edit",
            )}
          </form>
        ) : (
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

                {task.status === "in_progress" ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                    In Progress
                  </span>
                ) : null}

                {task.recurrence_rule ? (
                  <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-fuchsia-800">
                    Repeats {titleCase(task.recurrence_rule)}
                  </span>
                ) : null}

                {task.source_type === "google_marketing" ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">
                    Google
                  </span>
                ) : null}
              </div>

              {destination ? (
                <button
                  type="button"
                  onClick={() => router.push(destination)}
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
                  onClick={() => {
                    if (destination) {
                      router.push(destination);
                    }
                  }}
                  className="mt-3 block w-full cursor-pointer rounded-lg border border-slate-200 bg-white/80 px-3 py-3 text-left text-xs text-slate-700 transition hover:border-slate-400 hover:bg-white"
                >
                  <span className="font-bold">
                    Related lead:
                  </span>{" "}
                  <span className="font-semibold underline decoration-slate-300 underline-offset-4">
                    {relatedLead.name ?? "Unnamed lead"}
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
              <button
                type="button"
                onClick={() => beginEditing(task)}
                disabled={isUpdating || isSaving}
                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 disabled:text-blue-300"
              >
                Edit
              </button>

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
        )}
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

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              Google Marketing
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-950">
              Recurring Google profile and SEO tasks
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
              Adds daily, weekly, and monthly tasks for profile
              monitoring, posts, photos, reviews, profile audits, and
              Search Console reporting.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void addGoogleTasks()}
            disabled={
              isAddingGoogleTasks ||
              googleTasksConfigured
            }
            className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isAddingGoogleTasks
              ? "Adding Google Tasks..."
              : googleTasksConfigured
                ? "Google Tasks Added"
                : `Add ${missingGoogleTaskTemplates.length} Google Tasks`}
          </button>
        </div>
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
              setShowAddTask((current) => !current);
              setEditingTaskId(null);
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
                setCategoryFilter(event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              <option value="all">All Categories</option>

              {categoryOptions.map((category) => (
                <option
                  key={category.value}
                  value={category.value}
                >
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-950">
              Filter by Employee
            </span>

            <select
              value={assigneeFilter}
              onChange={(event) =>
                setAssigneeFilter(event.target.value)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              <option value="all">Everyone</option>
              <option value="unassigned">Unassigned</option>

              {activeTeamMembers.map((member) => (
                <option
                  key={member.id}
                  value={member.id}
                >
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {showAddTask ? (
          <form
            onSubmit={createTask}
            className="mt-6 space-y-5 border-t border-slate-200 pt-6"
          >
            {renderTaskForm(
              taskForm,
              setTaskForm,
              "create",
            )}
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