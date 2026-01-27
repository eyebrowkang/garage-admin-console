import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { Plus, Server, Trash2, ArrowRight, Activity, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

const API_URL = 'http://localhost:3001';

export default function Dashboard() {
    const token = localStorage.getItem('token');
    const queryClient = useQueryClient();
    const [newCluster, setNewCluster] = useState({ name: '', endpoint: '', region: '', adminToken: '' });
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Fetch Clusters
    const { data: clusters, isLoading } = useQuery({
        queryKey: ['clusters'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/clusters`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        }
    });

    // Create Cluster
    const createMutation = useMutation({
        mutationFn: async (data: any) => {
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

    // Delete Cluster
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

    if (isLoading) return (
        <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">Manage your Garage storage clusters from a centralized view.</p>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="lg" className="shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
                            <Plus className="mr-2 h-5 w-5" /> Connect Cluster
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                            <DialogTitle>Connect Garage Cluster</DialogTitle>
                            <DialogDescription>
                                Add a new existing Garage cluster to manage.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Friendly Name</Label>
                                <Input id="name" value={newCluster.name} onChange={e => setNewCluster({ ...newCluster, name: e.target.value })} placeholder="Production Cluster" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="endpoint">Endpoint URL</Label>
                                <Input id="endpoint" value={newCluster.endpoint} onChange={e => setNewCluster({ ...newCluster, endpoint: e.target.value })} placeholder="http://10.0.0.1:3903" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="region">Region</Label>
                                <Input id="region" value={newCluster.region} onChange={e => setNewCluster({ ...newCluster, region: e.target.value })} placeholder="us-east-1" />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="token">Admin Token</Label>
                                <Input id="token" type="password" value={newCluster.adminToken} onChange={e => setNewCluster({ ...newCluster, adminToken: e.target.value })} placeholder="Garage Admin API Token" />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => createMutation.mutate(newCluster)}>Connect</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {clusters?.length === 0 ? (
                <Card className="border-dashed border-2 bg-slate-50/50">
                    <CardContent className="h-64 flex flex-col items-center justify-center text-center p-8 space-y-4">
                        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
                            <Server className="h-8 w-8 text-slate-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">No clusters connected</h3>
                            <p className="text-muted-foreground">Start by connecting your first Garage cluster.</p>
                        </div>
                        <Button variant="outline" onClick={() => setIsDialogOpen(true)}>Connect Now</Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {clusters?.map((cluster: any) => (
                        <Card key={cluster.id} className="group hover:shadow-xl transition-all duration-300 border-slate-200 bg-white/50 backdrop-blur-sm overflow-hidden relative">
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full shadow-sm" onClick={(e) => {
                                    e.preventDefault();
                                    if (confirm('Disconnect this cluster?')) deleteMutation.mutate(cluster.id);
                                }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>

                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <Server className="h-5 w-5" />
                                    </div>
                                    {/* Status Indicator Mock */}
                                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                        Active
                                    </div>
                                </div>
                                <CardTitle className="mt-4 text-xl font-bold">{cluster.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center text-slate-500">
                                        <Activity className="h-4 w-4 mr-2 text-slate-400" />
                                        <span className="truncate">{cluster.endpoint}</span>
                                    </div>
                                    <div className="flex items-center text-slate-500">
                                        <MapPin className="h-4 w-4 mr-2 text-slate-400" />
                                        <span>{cluster.region || 'Default Region'}</span>
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <Link to={`/clusters/${cluster.id}`}>
                                        <Button className="w-full justify-between group-hover:bg-primary group-hover:text-white transition-colors" variant="outline">
                                            Manage Cluster
                                            <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                        </Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
