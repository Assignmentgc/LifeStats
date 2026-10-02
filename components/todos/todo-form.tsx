"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTodo, type TodoFormState } from "@/app/actions/todos";
import { Button, Panel } from "@/components/ui";
import { TODO_CATEGORIES } from "@/lib/todos";

const initialState: TodoFormState = {};

export function TodoForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(createTodo, initialState);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <Panel className="todo-form-panel">
      <form action={formAction} className="stack-16" ref={formRef}>
        <div className="form-heading">
          <div><p className="eyebrow">New task</p><h2>Add to your list</h2></div>
          <span className="form-heading__hint">Choose where it belongs before adding it.</span>
        </div>
        <label className="field">
          <span className="field__label">Task</span>
          <input className="input" maxLength={240} name="title" placeholder="e.g. Book a dentist appointment" required />
        </label>
        <label className="field">
          <span className="field__label">Category</span>
          <select className="select" defaultValue="important" name="category">
            {TODO_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label} — {category.description}</option>)}
          </select>
        </label>
        {state.error ? <p className="form-message form-message--error">{state.error}</p> : null}
        {state.success ? <p className="form-message form-message--success">{state.success}</p> : null}
        <Button loading={isPending} type="submit" variant="primary">Add task</Button>
      </form>
    </Panel>
  );
}
