import LoginForm from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Admin login</h1>
      <p className="mt-2 text-slate-300">Adding and mirroring alerts is limited to admins.</p>
      <LoginForm />
    </div>
  );
}
