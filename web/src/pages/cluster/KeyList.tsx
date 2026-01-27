import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

interface KeyListProps {
    clusterId: string;
}

const API_URL = 'http://localhost:3001';

export function KeyList({ clusterId }: KeyListProps) {
    const token = localStorage.getItem('token');
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');

    const { data: keys, isLoading, error } = useQuery({
        queryKey: ['keys', clusterId],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/proxy/${clusterId}/v2/ListKeys`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        }
    });

    const createMutation = useMutation({
        mutationFn: async (name: string) => {
            await axios.post(`${API_URL}/proxy/${clusterId}/v2/CreateKey`, {
                name
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
            setIsDialogOpen(false);
            setNewKeyName('');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await axios.post(`${API_URL}/proxy/${clusterId}/v2/DeleteKey?id=${id}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
        }
    });

    if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>;
    if (error) return <div className="text-red-500">Error loading keys</div>;

    const keyList = Array.isArray(keys) ? keys : (keys as any)?.keys || []; // Adjust based on actual response

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Create Key</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create Access Key</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2">
                            <Label>Key Name</Label>
                            <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="my-app-key" />
                        </div>
                        <DialogFooter>
                            <Button onClick={() => createMutation.mutate(newKeyName)} disabled={createMutation.isPending}>Create</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Access Key ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {keyList.map((k: any) => (
                            <TableRow key={k.accessKeyId || k.id}>
                                <TableCell className="font-mono text-xs">{k.accessKeyId || k.id}</TableCell>
                                <TableCell>{k.name}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(k.accessKeyId || k.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {keyList.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                                    No keys found
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
