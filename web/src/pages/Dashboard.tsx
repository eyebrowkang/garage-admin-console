import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { Plus, Server, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_URL = 'http://localhost:3001';

interface Cluster {
    id: string;
    name: string;
    endpoint: string;
    region: string | null;
    createdAt: string;
}

export default function Dashboard() {
    const queryClient = useQueryClient();
    const token = localStorage.getItem('token');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newCluster, setNewCluster] = useState({ name: '', endpoint: '', region: '', adminToken: '' });

    const { data: clusters, isLoading, error } = useQuery({
        queryKey: ['clusters'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/clusters`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data as Cluster[];
        }
    });

    const createMutation = useMutation({
        mutationFn: async (data: typeof newCluster) => {
            await axios.post(`${API_URL}/clusters`, data, {
                headers: { Authorization: `Bearer ${token}` }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clusters'] });
            setIsDialogOpen(false);
            setNewCluster({ name: '', endpoint: '', region: '', adminToken: '' });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await axios.delete(`${API_URL}/clusters/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['clusters'] });
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(newCluster);
    };

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error loading clusters</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button><Plus className="mr-2 h-4 w-4" /> Add Cluster</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Garage Cluster</DialogTitle>
                            <DialogDescription>
                                Connect to an existing Garage cluster. You need the Admin API Token.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input value={newCluster.name} onChange={e => setNewCluster({ ...newCluster, name: e.target.value })} required placeholder="My Cluster" />
                            </div>
                            <div className="space-y-2">
                                <Label>Endpoint URL</Label>
                                <Input value={newCluster.endpoint} onChange={e => setNewCluster({ ...newCluster, endpoint: e.target.value })} required placeholder="http://127.0.0.1:3903" />
                            </div>
                            <div className="space-y-2">
                                <Label>Region (Optional)</Label>
                                <Input value={newCluster.region} onChange={e => setNewCluster({ ...newCluster, region: e.target.value })} placeholder="us-east-1" />
                            </div>
                            <div className="space-y-2">
                                <Label>Admin Token</Label>
                                <Input type="password" value={newCluster.adminToken} onChange={e => setNewCluster({ ...newCluster, adminToken: e.target.value })} required placeholder="s3cret..." />
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={createMutation.isPending}>
                                    {createMutation.isPending ? 'Connecting...' : 'Connect'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {clusters?.map(cluster => (
                    <Card key={cluster.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {cluster.name}
                            </CardTitle>
                            <Server className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{cluster.region || 'Local'}</div>
                            <p className="text-xs text-muted-foreground truncate">{cluster.endpoint}</p>
                            <div className="mt-4 flex justify-end space-x-2">
                                <Button variant="outline" size="sm" asChild>
                                    <Link to={`/clusters/${cluster.id}`}>Manage</Link>
                                </Button>
                                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate(cluster.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
