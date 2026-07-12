import { useQuery } from '@tanstack/react-query';
import { Plus, Settings2 } from 'lucide-react';
import api from '../lib/api';
import { Link } from 'react-router-dom';

export default function Dashboard() {

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get('/projects');
      return res.data;
    }
  });

  if (isLoading) {
    return <div className="text-zinc-400">Loading projects...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
          <p className="text-zinc-400">Manage your distributed processing pipelines.</p>
        </div>
        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-blue-600 transition-colors">
          <Plus className="w-5 h-5" />
          New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects?.map((project: any) => (
          <div key={project.id} className="glass rounded-2xl p-6 flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-white">{project.name}</h3>
                <p className="text-sm text-zinc-500">ID: {project.id.slice(0, 8)}...</p>
              </div>
              <button className="text-zinc-500 hover:text-white transition-colors">
                <Settings2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="mt-auto pt-4 border-t border-zinc-800/50">
              <Link 
                to={`/projects/${project.id}/queues/default`} 
                className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1"
              >
                View Queues &rarr;
              </Link>
            </div>
          </div>
        ))}
        {projects?.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center glass rounded-2xl border-dashed border-2 border-zinc-800">
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
              <Plus className="w-8 h-8 text-zinc-500" />
            </div>
            <h3 className="text-lg font-medium text-white">No projects found</h3>
            <p className="text-zinc-500">Create your first project to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
