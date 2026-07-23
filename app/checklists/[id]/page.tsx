import ChecklistDetail from "./checklist-detail";

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChecklistDetail checklistId={id} />;
}
