import { readinessSiteReports } from "@/lib/readiness/site-reports";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [...readinessSiteReports().files.keys()].map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const report = readinessSiteReports().files.get((await params).file);
  return report ? Response.json(report) : new Response("Report not found", { status: 404 });
}
