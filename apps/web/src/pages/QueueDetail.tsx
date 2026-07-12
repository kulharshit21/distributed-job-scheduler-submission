import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Play, Pause, Activity, Clock, CheckCircle2, XCircle } from 'lucide-react';
import api from '../lib/api';

export default function QueueDetail() {
  const { projectId, queueId } = useParams();

  const { data: queueStats } = useQuery({
    queryKey: ['queueStats', queueId],
    queryFn: async () => {
      // In a real app we'd fetch actual queue list and pick this one, or just get it directly if id is known.
      // For demo, we assume queueId is passed correctly or we fetch first queue of project.
      try {
        const res = await api.get(`/queues/${queueId}/stats`);
        return res.data;
      } catch {
        return null; // Handle fallback if queue doesn't exist yet
      }
    },
    refetchInterval: 5000,
  });

  const { data: jobs } = useQuery({
    queryKey: ['jobs', queueId],
    queryFn: async () => {
      try {
        const res = await api.get(`/queues/${queueId}/jobs`);
        return res.data;
      } catch {
        return [];
      }
    },
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-white">Queue: {queueId}</h1>
            {queueStats?.is_paused ? (
              <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">Paused</span>
            ) : (
              <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Active</span>
            )}
          </div>
          <p className="text-zinc-400">Project ID: {projectId}</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors">
            {queueStats?.is_paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {queueStats?.is_paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Queued', value: queueStats?.job_counts?.queued || 0, icon: Clock, color: 'text-blue-400' },
          { label: 'Running', value: queueStats?.job_counts?.running || 0, icon: Activity, color: 'text-amber-400' },
          { label: 'Completed', value: queueStats?.job_counts?.completed || 0, icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Failed', value: queueStats?.job_counts?.['dead-letter'] || 0, icon: XCircle, color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="glass rounded-2xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <span className="text-zinc-400 font-medium">{stat.label}</span>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <span className="text-3xl font-bold text-white">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-zinc-800/50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Recent Jobs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="bg-zinc-900/50 text-xs uppercase font-semibold text-zinc-500">
              <tr>
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Attempts</th>
                <th className="px-6 py-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {jobs?.map((job: any) => (
                <tr key={job.id} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-6 py-4 font-mono text-zinc-300">{job.id.slice(0, 8)}</td>
                  <td className="px-6 py-4">{job.type}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${
                      job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                      job.status === 'running' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      job.status === 'dead-letter' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                      'bg-blue-500/10 text-blue-500 border-blue-500/20'
                    }`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{job.attempt_count} / {job.max_attempts}</td>
                  <td className="px-6 py-4">{new Date(job.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {(!jobs || jobs.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    No jobs found in this queue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
