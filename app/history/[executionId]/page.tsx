import ExecutionHistoryDetail from "./execution-history-detail";

export default async function ExecutionHistoryPage({ params }: { params: Promise<{ executionId: string }> }) {
  const { executionId } = await params;
  return <ExecutionHistoryDetail executionId={executionId} />;
}
