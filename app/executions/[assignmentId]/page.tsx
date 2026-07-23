import ChecklistExecution from "./checklist-execution";

export default async function ExecutionPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  return <ChecklistExecution assignmentId={assignmentId} />;
}
