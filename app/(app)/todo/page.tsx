import { TodoBoard } from "@/components/todos/todo-board";
import { TodoForm } from "@/components/todos/todo-form";
import { getTodoData } from "@/lib/data";

export default async function TodoPage() {
  const todos = await getTodoData();
  return <main className="page-container todo-page">
    <header className="page-header"><div><p className="eyebrow">Focus system</p><h1 className="page-title">To-Do</h1><p className="page-description">Sort your next actions by what deserves your attention now.</p></div></header>
    <div className="todo-page__grid"><TodoForm /><TodoBoard todos={todos} /></div>
  </main>;
}
