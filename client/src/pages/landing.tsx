import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, BarChart, Calendar, Zap } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Priority Task Manager
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Intelligent task management with automatic priority scoring. Focus on what matters most.
          </p>
          <Button 
            size="lg" 
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-login"
            className="text-lg px-8 py-6"
          >
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
          <Card data-testid="card-feature-priority">
            <CardHeader>
              <Zap className="w-10 h-10 mb-2 text-primary" />
              <CardTitle>Smart Priorities</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Automatic priority calculation based on urgency, impact, and effort analysis
              </CardDescription>
            </CardContent>
          </Card>

          <Card data-testid="card-feature-analytics">
            <CardHeader>
              <BarChart className="w-10 h-10 mb-2 text-primary" />
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Visual insights into your task distribution and productivity metrics
              </CardDescription>
            </CardContent>
          </Card>

          <Card data-testid="card-feature-calendar">
            <CardHeader>
              <Calendar className="w-10 h-10 mb-2 text-primary" />
              <CardTitle>Calendar Views</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Multiple time-based views with drag-and-drop task rescheduling
              </CardDescription>
            </CardContent>
          </Card>

          <Card data-testid="card-feature-organization">
            <CardHeader>
              <CheckCircle className="w-10 h-10 mb-2 text-primary" />
              <CardTitle>Stay Organized</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Track status, search tasks, and get intelligent autocomplete suggestions
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="mt-20 text-center">
          <h2 className="text-3xl font-bold mb-4">Why Priority Task Manager?</h2>
          <div className="max-w-3xl mx-auto space-y-4 text-left">
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Intelligent Priority Engine</h3>
                <p className="text-muted-foreground">
                  Our algorithm analyzes keywords, deadlines, and task relationships to automatically score priorities
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Secure & Private</h3>
                <p className="text-muted-foreground">
                  Your tasks are stored securely with user-specific access control
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Import & Export</h3>
                <p className="text-muted-foreground">
                  Work with CSV, Excel, and Google Sheets for seamless data management
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <Button 
            size="lg" 
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-login-bottom"
            className="text-lg px-8 py-6"
          >
            Sign In to Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
