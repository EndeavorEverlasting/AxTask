import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PretextPageHeader } from "@/components/pretext/pretext-page-header";
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export default function BillingBridgeDashboard() {
  const [month, setMonth] = useState("2026-04");
  const [pipelineState, setPipelineState] = useState<"idle" | "running" | "done">("idle");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <PretextPageHeader
        eyebrow="Operator"
        title={
          <span className="inline-flex items-center gap-3">
            <FileSpreadsheet className="h-7 w-7 text-primary" />
            Billing Bridge Dashboard
          </span>
        }
        subtitle="Manage the monthly billing pipeline. Upload sources, review classifications, run the bridge, and generate the final email packet."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-panel-glossy">
          <CardHeader>
            <CardTitle>1. Month & Sources</CardTitle>
            <CardDescription>Select month and upload source files</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Month</Label>
              <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Source Files (Paylocity PDFs, Invoices, Workbooks)</Label>
              <Input type="file" multiple className="text-xs" />
            </div>
            <Button variant="secondary" className="w-full">
              <Upload className="mr-2 h-4 w-4" /> Upload Sources
            </Button>
          </CardContent>
        </Card>

        <Card className="glass-panel-glossy">
          <CardHeader>
            <CardTitle>2. Pipeline Status</CardTitle>
            <CardDescription>Run and monitor pipeline stages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span>1. Classify files</span> <Badge variant="outline">Done</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>2. Parse sources</span> <Badge variant="secondary">Pending</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>3. Normalize ledgers</span> <Badge variant="secondary">Pending</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>4. Update workbook</span> <Badge variant="secondary">Pending</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>5. Validate Web Excel</span> <Badge variant="secondary">Pending</Badge>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>6. Generate email packet</span> <Badge variant="secondary">Pending</Badge>
              </div>
            </div>
            <Button 
              className="w-full"
              disabled={pipelineState === "running"}
              onClick={() => setPipelineState("running")}
            >
              {pipelineState === "running" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Running...</> : "Run Pipeline"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>3. Review Queue</CardTitle>
          <CardDescription>Classification results and uncertain files</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Detected Type</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Paylocity_April.pdf</TableCell>
                <TableCell><Badge variant="outline">paylocity_pdf</Badge></TableCell>
                <TableCell className="text-green-600">94%</TableCell>
                <TableCell><Button size="sm" variant="ghost">Accept</Button></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>invoice_0412.docx</TableCell>
                <TableCell><Badge variant="outline">aaa_logistics_invoice</Badge></TableCell>
                <TableCell className="text-amber-600">88%</TableCell>
                <TableCell><Button size="sm" variant="ghost">Review</Button></TableCell>
              </TableRow>
              <TableRow>
                <TableCell>random.xlsx</TableCell>
                <TableCell><Badge variant="outline">unknown_review_required</Badge></TableCell>
                <TableCell className="text-red-600">41%</TableCell>
                <TableCell><Button size="sm" variant="destructive">Assign type</Button></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Email Draft Output</CardTitle>
          <CardDescription>LLM-safe email packet summary</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-md font-mono text-xs overflow-auto">
            {JSON.stringify({
              month: "April 2026",
              status: "workbook validated",
              attachments: ["CANDIDATE_April_2026_Billing_Bridge_WEBSAFE.xlsx"],
              exceptions: [],
              requested_outputs: ["subject", "email_body"]
            }, null, 2)}
          </div>
          <div className="space-y-2">
            <Label>Generated Subject</Label>
            <Input readOnly value="April 2026 Billing Bridge - Ready for Review" />
          </div>
          <div className="space-y-2">
            <Label>Generated Body</Label>
            <Textarea readOnly value="The billing bridge for April 2026 has successfully run. All files have been parsed, normalized, and validated." />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
