import { useQuery } from '@tanstack/react-query';
import { Plus, FolderOpen } from 'lucide-react';
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
          <p className="text-zinc-400">Manage your distributed processing pipelines.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects?.map((project: any, index: number) => (
          <ProjectCard key={project.id} project={project} index={index} />
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

import { motion } from 'framer-motion';

function ProjectCard({ project, index }: { project: any, index: number }) {
  const { data: queues } = useQuery({
    queryKey: ['queues', project.id],
    queryFn: async () => {
      const res = await api.get(`/projects/${project.id}/queues`);
      return res.data;
    }
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      whileHover={{ y: -5, scale: 1.02 }}
      className="glass rounded-2xl p-6 flex flex-col relative overflow-hidden group border border-zinc-800/50 hover:border-blue-500/30 transition-colors"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div>
          <h3 className="text-xl font-semibold text-white group-hover:text-blue-400 transition-colors">{project.name}</h3>
          <p className="text-sm text-zinc-500">ID: {project.id.slice(0, 8)}...</p>
        </div>
        <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
          <FolderOpen className="w-5 h-5 text-blue-400" />
        </div>
      </div>
      
      <div className="mt-auto pt-4 border-t border-zinc-800/50 space-y-2 relative z-10">
        {queues && queues.length > 0 ? (
          queues.map((queue: any) => (
            <Link 
              key={queue.id}
              to={`/projects/${project.id}/queues/${queue.id}`} 
              className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1 py-1"
            >
              {queue.name} &rarr;
            </Link>
          ))
        ) : (
          <p className="text-zinc-500 text-sm">No queues yet</p>
        )}
      </div>
    </motion.div>
  );
}
