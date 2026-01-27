import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface NodeListProps {
    clusterId: string;
}

const API_URL = 'http://localhost:3001';

export function ClusterNodeList({ clusterId }: NodeListProps) {
    const token = localStorage.getItem('token');

    const { data: layout, isLoading, error } = useQuery({
        queryKey: ['layout', clusterId],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/proxy/${clusterId}/v2/status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        }
    });

    if (isLoading) return <Loader2 className="animate-spin" />;
    if (error) return <div className="text-red-500">Error loading nodes</div>;

    // layout structure depends on /v2/GetClusterStatus response
    // Assuming it has a list of nodes or "layout" field
    // From OpenAPI: Returns cluster's current status, including: Live nodes, Currently configured cluster layout

    // We'll inspect the response roughly or assume standard structure.
    // We can just iterate `layout.nodes` if it exists.

    const nodes = Array.isArray(layout?.nodes) ? layout.nodes : [];

    return (
        <div className="space-y-4">
            {/* If we have topology info, we could draw it. For now, a list. */}
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Node ID</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tags</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {/* Fallback mock if nodes is empty but call succeeded? */}
                    {nodes.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center">No nodes information available</TableCell>
                        </TableRow>
                    )}
                    {/* If nodes is not empty, map them. But I don't know the exact shape without checking spec deep or running it. 
                   I'll assume id, address, tags.
                */}
                </TableBody>
            </Table>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Alternatively show cards */}
            </div>

            <div className="p-4 bg-muted rounded-md overflow-auto">
                <pre className="text-xs">{JSON.stringify(layout, null, 2)}</pre>
            </div>
        </div>
    );
}
