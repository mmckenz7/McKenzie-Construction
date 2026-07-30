"use client";

import {
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  job_title: string | null;
};

type Project = {
  id: string;
  customer_id: string;
  project_name: string;
  project_type: string | null;
  description: string | null;
  property_address: string | null;
  status: string;
  project_manager_id: string | null;
  estimated_value: number | null;
  contract_value: number | null;
  start_date: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectTask = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  task_type: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
  assigned_to_id: string | null;
  recurrence_rule: string | null;
  created_at: string;
};

type ProjectDetailManagerProps = {
  project: Project;
  tasks: ProjectTask[];
  teamMembers: TeamMember[];
  requireProjectManager: boolean;
};

type ProjectFormState = {
  projectName: string;
  projectType: string;
  description: string;
  propertyAddress: string;
  status: string;
  projectManagerId: string;
  estimatedValue: string;
  contractValue: string;
  startDate: string;
  targetCompletionDate: string;
  notes: string;
};

type TaskFormState = {
  title: string;
  description: string;
  category: string;
  priority: string;
  dueAt: string;
  assignedToId: string;
  recurrenceRule: string;
};

function formatStatus(
  value: string,
) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

function formatDateAndTime(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function getTaskClasses(
  task: ProjectTask,
) {
  if (
    task.status ===
    "completed"
  ) {
    return "border-emerald-200 bg-emerald-50";
  }

  if (
    task.status ===
    "canceled"
  ) {
    return "border-slate-200 bg-slate-50";
  }

  if (
    task.due_at &&
    new Date(
      task.due_at,
    ).getTime() <
      Date.now()
  ) {
    return "border-red-200 bg-red-50";
  }

  return "border-amber-200 bg-amber-50";
}

function toDateTimeLocal(
  value: string | null,
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  const offset =
    date.getTimezoneOffset();

  const localDate =
    new Date(
      date.getTime() -
        offset * 60000,
    );

  return localDate
    .toISOString()
    .slice(0, 16);
}

export function ProjectDetailManager({
  project,
  tasks,
  teamMembers,
  requireProjectManager,
}: ProjectDetailManagerProps) {
  const router = useRouter();

  const [isSavingProject, setIsSavingProject] =
    useState(false);

  const [isCreatingTask, setIsCreatingTask] =
    useState(false);

  const [projectError, setProjectError] =
    useState("");

  const [projectSuccess, setProjectSuccess] =
    useState("");

  const [taskError, setTaskError] =
    useState("");

  const [taskSuccess, setTaskSuccess] =
    useState("");

  const [projectForm, setProjectForm] =
    useState<ProjectFormState>({
      projectName:
        project.project_name,
      projectType:
        project.project_type ?? "",
      description:
        project.description ?? "",
      propertyAddress:
        project.property_address ?? "",
      status:
        project.status,
      projectManagerId:
        project.project_manager_id ?? "",
      estimatedValue:
        project.estimated_value !==
        null
          ? String(
              project.estimated_value,
            )
          : "",
      contractValue:
        project.contract_value !==
        null
          ? String(
              project.contract_value,
            )
          : "",
      startDate:
        project.start_date ?? "",
      targetCompletionDate:
        project.target_completion_date ??
        "",
      notes:
        project.notes ?? "",
    });

  const [taskForm, setTaskForm] =
    useState<TaskFormState>({
      title: "",
      description: "",
      category: "project",
      priority: "normal",
      dueAt: "",
      assignedToId:
        project.project_manager_id ??
        "",
      recurrenceRule: "none",
    });

  const openTasks =
    tasks.filter(
      (task) =>
        task.status ===
          "open" ||
        task.status ===
          "in_progress",
    );

  const closedTasks =
    tasks.filter(
      (task) =>
        task.status !==
          "open" &&
        task.status !==
          "in_progress",
    );

  function updateProjectField(
    field: keyof ProjectFormState,
    value: string,
  ) {
    setProjectForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  }

  function updateTaskField(
    field: keyof TaskFormState,
    value: string,
  ) {
    setTaskForm(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  }

  async function handleProjectSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setProjectError("");
    setProjectSuccess("");

    if (
      !projectForm.projectName.trim()
    ) {
      setProjectError(
        "The project name is required.",
      );

      return;
    }

    if (
      requireProjectManager &&
      !projectForm.projectManagerId
    ) {
      setProjectError(
        "A project manager is required.",
      );

      return;
    }

    setIsSavingProject(true);

    try {
      const response =
        await fetch(
          `/api/projects/${project.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              projectName:
                projectForm.projectName,
              projectType:
                projectForm.projectType,
              description:
                projectForm.description,
              propertyAddress:
                projectForm.propertyAddress,
              status:
                projectForm.status,
              projectManagerId:
                projectForm.projectManagerId ||
                null,
              estimatedValue:
                projectForm.estimatedValue,
              contractValue:
                projectForm.contractValue,
              startDate:
                projectForm.startDate,
              targetCompletionDate:
                projectForm.targetCompletionDate,
              notes:
                projectForm.notes,
            }),
          },
        );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "The project could not be updated.",
        );
      }

      setProjectSuccess(
        "Project updated successfully.",
      );

      router.refresh();
    } catch (error) {
      setProjectError(
        error instanceof Error
          ? error.message
          : "The project could not be updated.",
      );
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleTaskSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setTaskError("");
    setTaskSuccess("");

    if (
      !taskForm.title.trim()
    ) {
      setTaskError(
        "The task title is required.",
      );

      return;
    }

    if (
      taskForm.recurrenceRule !==
        "none" &&
      !taskForm.dueAt
    ) {
      setTaskError(
        "Recurring tasks require a due date.",
      );

      return;
    }

    setIsCreatingTask(true);

    try {
      const response =
        await fetch(
          "/api/tasks",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              title:
                taskForm.title,
              description:
                taskForm.description,
              category:
                taskForm.category,
              priority:
                taskForm.priority,
              dueAt:
                taskForm.dueAt
                  ? new Date(
                      taskForm.dueAt,
                    ).toISOString()
                  : null,
              assignedToId:
                taskForm.assignedToId ||
                null,
              projectId:
                project.id,
              customerId:
                project.customer_id,
              recurrenceRule:
                taskForm.recurrenceRule,
              sourceType:
                "project_detail_page",
              metadata: {
                created_from:
                  "project_detail_page",
                project_id:
                  project.id,
                customer_id:
                  project.customer_id,
              },
            }),
          },
        );

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "The task could not be created.",
        );
      }

      setTaskSuccess(
        "Task created successfully.",
      );

      setTaskForm({
        title: "",
        description: "",
        category: "project",
        priority: "normal",
        dueAt: "",
        assignedToId:
          projectForm.projectManagerId,
        recurrenceRule: "none",
      });

      router.refresh();
    } catch (error) {
      setTaskError(
        error instanceof Error
          ? error.message
          : "The task could not be created.",
      );
    } finally {
      setIsCreatingTask(false);
    }
  }

  async function updateTaskStatus(
    taskId: string,
    status: string,
  ) {
    setTaskError("");
    setTaskSuccess("");

    try {
      const response =
        await fetch(
          `/api/tasks/${taskId}`,
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

      const result =
        (await response.json()) as {
          success?: boolean;
          error?: string;
          recurrenceWarning?: string | null;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "The task could not be updated.",
        );
      }

      setTaskSuccess(
        result.recurrenceWarning
          ? `Task updated. ${result.recurrenceWarning}`
          : "Task updated successfully.",
      );

      router.refresh();
    } catch (error) {
      setTaskError(
        error instanceof Error
          ? error.message
          : "The task could not be updated.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
          Project Management
        </p>

        <h2 className="mt-1 text-2xl font-bold text-slate-950">
          Project Details
        </h2>

        <form
          onSubmit={handleProjectSubmit}
          className="mt-6"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Project name
              </span>

              <input
                type="text"
                required
                value={
                  projectForm.projectName
                }
                onChange={(event) =>
                  updateProjectField(
                    "projectName",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Project type
              </span>

              <input
                type="text"
                value={
                  projectForm.projectType
                }
                onChange={(event) =>
                  updateProjectField(
                    "projectType",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Status
              </span>

              <select
                value={
                  projectForm.status
                }
                onChange={(event) =>
                  updateProjectField(
                    "status",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="planning">
                  Planning
                </option>

                <option value="scheduled">
                  Scheduled
                </option>

                <option value="in_progress">
                  In Progress
                </option>

                <option value="on_hold">
                  On Hold
                </option>

                <option value="completed">
                  Completed
                </option>

                <option value="canceled">
                  Canceled
                </option>
              </select>
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Property address
              </span>

              <input
                type="text"
                value={
                  projectForm.propertyAddress
                }
                onChange={(event) =>
                  updateProjectField(
                    "propertyAddress",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Project manager
              </span>

              <select
                value={
                  projectForm.projectManagerId
                }
                onChange={(event) =>
                  updateProjectField(
                    "projectManagerId",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">
                  Unassigned
                </option>

                {teamMembers.map(
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

            <label>
              <span className="text-sm font-bold text-slate-800">
                Estimated value
              </span>

              <input
                type="text"
                inputMode="decimal"
                value={
                  projectForm.estimatedValue
                }
                onChange={(event) =>
                  updateProjectField(
                    "estimatedValue",
                    event.target.value,
                  )
                }
                placeholder="$0.00"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Contract value
              </span>

              <input
                type="text"
                inputMode="decimal"
                value={
                  projectForm.contractValue
                }
                onChange={(event) =>
                  updateProjectField(
                    "contractValue",
                    event.target.value,
                  )
                }
                placeholder="$0.00"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Start date
              </span>

              <input
                type="date"
                value={
                  projectForm.startDate
                }
                onChange={(event) =>
                  updateProjectField(
                    "startDate",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Target completion
              </span>

              <input
                type="date"
                value={
                  projectForm.targetCompletionDate
                }
                onChange={(event) =>
                  updateProjectField(
                    "targetCompletionDate",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Description
              </span>

              <textarea
                rows={4}
                value={
                  projectForm.description
                }
                onChange={(event) =>
                  updateProjectField(
                    "description",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Internal notes
              </span>

              <textarea
                rows={5}
                value={
                  projectForm.notes
                }
                onChange={(event) =>
                  updateProjectField(
                    "notes",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          {projectError ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {projectError}
            </div>
          ) : null}

          {projectSuccess ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {projectSuccess}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={
              isSavingProject
            }
            className="mt-6 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {isSavingProject
              ? "Saving..."
              : "Save Project"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
          Project Tasks
        </p>

        <h2 className="mt-1 text-2xl font-bold text-slate-950">
          Create Task
        </h2>

        <form
          onSubmit={handleTaskSubmit}
          className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Task title
              </span>

              <input
                type="text"
                required
                value={taskForm.title}
                onChange={(event) =>
                  updateTaskField(
                    "title",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Category
              </span>

              <select
                value={
                  taskForm.category
                }
                onChange={(event) =>
                  updateTaskField(
                    "category",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="project">
                  Project
                </option>

                <option value="operations">
                  Operations
                </option>

                <option value="accounting">
                  Accounting
                </option>

                <option value="customer_service">
                  Customer Service
                </option>

                <option value="administrative">
                  Administrative
                </option>

                <option value="owner">
                  Owner
                </option>
              </select>
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Priority
              </span>

              <select
                value={
                  taskForm.priority
                }
                onChange={(event) =>
                  updateTaskField(
                    "priority",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="low">
                  Low
                </option>

                <option value="normal">
                  Normal
                </option>

                <option value="high">
                  High
                </option>

                <option value="urgent">
                  Urgent
                </option>
              </select>
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Due date and time
              </span>

              <input
                type="datetime-local"
                value={
                  taskForm.dueAt
                }
                onChange={(event) =>
                  updateTaskField(
                    "dueAt",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
            </label>

            <label>
              <span className="text-sm font-bold text-slate-800">
                Assignee
              </span>

              <select
                value={
                  taskForm.assignedToId
                }
                onChange={(event) =>
                  updateTaskField(
                    "assignedToId",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">
                  Automatic or unassigned
                </option>

                {teamMembers.map(
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

            <label>
              <span className="text-sm font-bold text-slate-800">
                Recurrence
              </span>

              <select
                value={
                  taskForm.recurrenceRule
                }
                onChange={(event) =>
                  updateTaskField(
                    "recurrenceRule",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="none">
                  Does not repeat
                </option>

                <option value="daily">
                  Daily
                </option>

                <option value="weekly">
                  Weekly
                </option>

                <option value="monthly">
                  Monthly
                </option>
              </select>
            </label>

            <label className="md:col-span-2">
              <span className="text-sm font-bold text-slate-800">
                Description
              </span>

              <textarea
                rows={4}
                value={
                  taskForm.description
                }
                onChange={(event) =>
                  updateTaskField(
                    "description",
                    event.target.value,
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
              />
            </label>
          </div>

          {taskError ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {taskError}
            </div>
          ) : null}

          {taskSuccess ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              {taskSuccess}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={
              isCreatingTask
            }
            className="mt-6 rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {isCreatingTask
              ? "Creating..."
              : "Create Task"}
          </button>
        </form>

        <div className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-slate-950">
              Open Tasks
            </h3>

            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
              {openTasks.length}
            </span>
          </div>

          {openTasks.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              No open project tasks.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {openTasks.map(
                (task) => {
                  const assignee =
                    teamMembers.find(
                      (member) =>
                        member.id ===
                        task.assigned_to_id,
                    );

                  return (
                    <article
                      key={task.id}
                      className={`rounded-xl border p-4 ${getTaskClasses(
                        task,
                      )}`}
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div>
                          <h4 className="font-bold text-slate-950">
                            {task.title}
                          </h4>

                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {formatStatus(
                              task.priority,
                            )}{" "}
                            priority
                          </p>
                        </div>

                        <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                          {formatStatus(
                            task.status,
                          )}
                        </span>
                      </div>

                      {task.description ? (
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                          {task.description}
                        </p>
                      ) : null}

                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-slate-500">
                            Due
                          </dt>

                          <dd className="mt-1 font-semibold text-slate-900">
                            {formatDateAndTime(
                              task.due_at,
                            )}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-slate-500">
                            Assignee
                          </dt>

                          <dd className="mt-1 font-semibold text-slate-900">
                            {assignee?.name ??
                              "Unassigned"}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-slate-500">
                            Recurrence
                          </dt>

                          <dd className="mt-1 font-semibold text-slate-900">
                            {task.recurrence_rule
                              ? formatStatus(
                                  task.recurrence_rule,
                                )
                              : "None"}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                        {task.status ===
                        "open" ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateTaskStatus(
                                task.id,
                                "in_progress",
                              )
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            Start
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            updateTaskStatus(
                              task.id,
                              "completed",
                            )
                          }
                          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
                        >
                          Complete
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateTaskStatus(
                              task.id,
                              "canceled",
                            )
                          }
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          )}
        </div>

        {closedTasks.length > 0 ? (
          <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer font-bold text-slate-950">
              Closed Tasks (
              {closedTasks.length})
            </summary>

            <div className="mt-4 space-y-3">
              {closedTasks.map(
                (task) => (
                  <article
                    key={task.id}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-bold text-slate-900">
                        {task.title}
                      </h4>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                        {formatStatus(
                          task.status,
                        )}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      Completed:{" "}
                      {formatDateAndTime(
                        task.completed_at,
                      )}
                    </p>

                    {task.completion_note ? (
                      <p className="mt-2 text-sm text-slate-700">
                        {
                          task.completion_note
                        }
                      </p>
                    ) : null}
                  </article>
                ),
              )}
            </div>
          </details>
        ) : null}
      </section>
    </div>
  );
}