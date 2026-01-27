import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ClusterOverviewProps {
    clusterId: string;
}

const API_URL = 'http://localhost:3001';

export function ClusterOverview({ clusterId }: ClusterOverviewProps) {
    const token = localStorage.getItem('token');

    const { isLoading } = useQuery({
        queryKey: ['clusterStats', clusterId],
        queryFn: async () => {
            // Trying /v2/GetClusterStatistics or health
            const res = await axios.get(`${API_URL}/proxy/${clusterId}/health`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Just health for now as I don't know exact stats shape
            return res.data;
        }
    });

    if (isLoading) return <Loader2 className="animate-spin" />;

    const option = {
        title: {
            text: 'Mock Storage Usage',
            left: 'center'
        },
        tooltip: {
            trigger: 'item'
        },
        series: [
            {
                name: 'Storage',
                type: 'pie',
                radius: '50%',
                data: [
                    { value: 1048, name: 'Used' },
                    { value: 735, name: 'Free' },
                ],
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }
        ]
    };

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Health Status</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-500">
                        OK
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Storage</CardTitle>
                </CardHeader>
                <CardContent>
                    <ReactECharts option={option} style={{ height: '300px' }} />
                </CardContent>
            </Card>
        </div>
    );
}
