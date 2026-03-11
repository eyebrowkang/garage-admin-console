import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Pencil,
  HardDrive,
  Globe,
  Loader2,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConnectionFormDialog, type ConnectionFormData } from '@/components/ConnectionFormDialog';
import { DeleteConnectionDialog } from '@/components/DeleteConnectionDialog';

interface Connection {
  id: string;
  name: string;
  endpoint: string;
  region: string | null;
  bucket: string | null;
  pathStyle: boolean;
  createdAt: string;
  updatedAt: string;
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [deletingConnection, setDeletingConnection] = useState<Connection | null>(null);

  const {
    data: connections = [],
    isLoading,
    error,
  } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: async () => {
      const res = await api.get('/connections');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ConnectionFormData) => {
      const res = await api.post('/connections', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      setShowCreateDialog(false);
      toast({ title: 'Connection created', description: 'S3 connection added successfully.' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create connection',
        description: getApiErrorMessage(err),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ConnectionFormData> }) => {
      const res = await api.put(`/connections/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      setEditingConnection(null);
      toast({ title: 'Connection updated', description: 'S3 connection updated successfully.' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update connection',
        description: getApiErrorMessage(err),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      setDeletingConnection(null);
      toast({ title: 'Connection deleted', description: 'S3 connection removed.' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to delete connection',
        description: getApiErrorMessage(err),
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{getApiErrorMessage(error, 'Failed to load connections')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground">
            Manage your S3-compatible storage connections.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </div>

      {/* Connection list */}
      {connections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <HardDrive className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No connections yet</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              Add an S3-compatible storage connection to start browsing your buckets and objects.
            </p>
            <Button className="mt-6" onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Connection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => (
            <Card key={conn.id} className="group relative transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <HardDrive className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{conn.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 text-xs">
                        <Globe className="h-3 w-3" />
                        {conn.endpoint}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setEditingConnection(conn)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeletingConnection(conn)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  {conn.bucket ? (
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span className="font-mono text-xs">{conn.bucket}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span className="text-xs italic">All accessible buckets</span>
                    </div>
                  )}
                  {conn.region && (
                    <div className="text-xs">Region: {conn.region}</div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => navigate(`/connections/${conn.id}`)}
                >
                  Browse
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ConnectionFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />

      {editingConnection && (
        <ConnectionFormDialog
          open={!!editingConnection}
          onOpenChange={(open) => !open && setEditingConnection(null)}
          onSubmit={(data) =>
            updateMutation.mutate({ id: editingConnection.id, data })
          }
          isLoading={updateMutation.isPending}
          initialData={editingConnection}
        />
      )}

      {deletingConnection && (
        <DeleteConnectionDialog
          open={!!deletingConnection}
          onOpenChange={(open) => !open && setDeletingConnection(null)}
          onConfirm={() => deleteMutation.mutate(deletingConnection.id)}
          isLoading={deleteMutation.isPending}
          connectionName={deletingConnection.name}
        />
      )}
    </div>
  );
}
