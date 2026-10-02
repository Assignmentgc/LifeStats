"use client";

import { useState, useTransition } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { deleteTodo, setTodoCompleted } from "@/app/actions/todos";
import { Button, EmptyState, Panel } from "@/components/ui";
import { TODO_CATEGORIES, type TodoCategory } from "@/lib/todos";
import type { Todo } from "@/lib/types";

export function TodoBoard({ todos }: { todos: Todo[] }) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  function update(todoId: string, completed: boolean) {
    setError(null);
    if (completed) {
      setCelebratingId(todoId);
      window.setTimeout(() => {
        setHiddenIds((ids) => [...ids, todoId]);
        setCelebratingId(null);
        setPendingId(todoId);
        startTransition(async () => {
          const result = await setTodoCompleted(todoId, true);
          if (!result.success) {
            setError(result.error);
            setHiddenIds((ids) => ids.filter((id) => id !== todoId));
          }
          setPendingId(null);
        });
      }, 620);
      return;
    }
    setPendingId(todoId);
    startTransition(async () => { const result = await setTodoCompleted(todoId, false); if (!result.success) setError(result.error); setPendingId(null); });
  }

  function remove(todoId: string) {
    setError(null); setPendingId(todoId);
    startTransition(async () => { const result = await deleteTodo(todoId); if (!result.success) setError(result.error); setPendingId(null); });
  }

  if (!todos.length) return <EmptyState title="Your list is clear" description="Add a task, then place it in the category that best fits its priority." />;

  return (
    <div className="todo-board">
      {error ? <p className="form-message form-message--error">{error}</p> : null}
      {TODO_CATEGORIES.map((category) => <TodoColumn category={category.value} celebratingId={celebratingId} key={category.value} onRemove={remove} onToggle={update} pendingId={isPending ? pendingId : null} todos={todos.filter((todo) => todo.category === category.value && !hiddenIds.includes(todo.id))} />)}
    </div>
  );
}

function TodoColumn({ category, todos, pendingId, celebratingId, onToggle, onRemove }: {
  category: TodoCategory; todos: Todo[]; pendingId: string | null; celebratingId: string | null; onToggle: (id: string, done: boolean) => void; onRemove: (id: string) => void;
}) {
  const meta = TODO_CATEGORIES.find((item) => item.value === category)!;
  return <section className="todo-column" data-category={category}>
    <div className="todo-column__heading"><div><h2>{meta.label}</h2><p>{meta.description}</p></div><span>{todos.filter((todo) => !todo.is_completed).length}</span></div>
    <Panel className="todo-column__list" padded={false}>
      {todos.length ? todos.map((todo) => <div className={`todo-item ${todo.is_completed ? "todo-item--done" : ""} ${celebratingId === todo.id ? "todo-item--celebrating" : ""}`} key={todo.id}>
        <input aria-label={`Mark ${todo.title} ${todo.is_completed ? "incomplete" : "complete"}`} checked={todo.is_completed} disabled={pendingId === todo.id} onChange={(event) => onToggle(todo.id, event.target.checked)} type="checkbox" />
        <span>{todo.title}</span>
        {celebratingId === todo.id ? <Sparkles aria-hidden="true" className="todo-item__sparkles" size={18} /> : null}
        <Button aria-label={`Delete ${todo.title}`} disabled={pendingId === todo.id} onClick={() => onRemove(todo.id)} size="sm" variant="ghost"><Trash2 aria-hidden="true" size={14} /></Button>
      </div>) : <p className="todo-column__empty">Nothing here yet.</p>}
    </Panel>
  </section>;
}
