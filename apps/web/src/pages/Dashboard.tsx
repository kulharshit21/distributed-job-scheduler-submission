import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FolderOpen, X, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get('/projects');
      return res.data;
    }
  });

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/projects', { name: newProjectName, slug: newProjectSlug });
      toast.success('Project created successfully!');
      setShowProjectModal(false);
      setNewProjectName('');
      setNewProjectSlug('');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <button 
          onClick={() => setShowProjectModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Pipeline
        </button>
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

      {showProjectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass rounded-3xl p-6 w-full max-w-md border border-zinc-800"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">New Pipeline</h2>
              <button onClick={() => setShowProjectModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5 ml-1">Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  placeholder="e.g. Image Processing Pipeline"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5 ml-1">Slug</label>
                <input
                  type="text"
                  value={newProjectSlug}
                  onChange={e => setNewProjectSlug(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  placeholder="e.g. image-processing"
                  required
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl px-4 py-3 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}

import { motion } from 'framer-motion';

function ProjectCard({ project, index }: { project: any, index: number }) {
  const queryClient = useQueryClient();
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [newQueueName, setNewQueueName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: queues } = useQuery({
    queryKey: ['queues', project.id],
    queryFn: async () => {
      const res = await api.get(`/projects/${project.id}/queues`);
      return res.data;
    }
  });

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post(`/projects/${project.id}/queues`, { name: newQueueName, concurrency_limit: 5 });
      toast.success('Queue created successfully!');
      setShowQueueModal(false);
      setNewQueueName('');
      queryClient.invalidateQueries({ queryKey: ['queues', project.id] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create queue');
    } finally {
      setIsSubmitting(false);
    }
  };

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
              className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center justify-between py-1 group/link"
            >
              <span>{queue.name}</span>
              <span className="opacity-0 group-hover/link:opacity-100 transition-opacity">&rarr;</span>
            </Link>
          ))
        ) : (
          <p className="text-zinc-500 text-sm mb-2">No queues yet</p>
        )}
        
        <button 
          onClick={() => setShowQueueModal(true)}
          className="text-zinc-400 hover:text-white text-sm font-medium flex items-center gap-1 mt-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Queue
        </button>
      </div>

      {showQueueModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass rounded-3xl p-6 w-full max-w-md border border-zinc-800 cursor-default"
            onClick={e => e.stopPropagation()} // Prevent event bubbling if modal is inside a clickable area
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">New Queue for {project.name}</h2>
              <button onClick={() => setShowQueueModal(false)} className="text-zinc-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1.5 ml-1">Queue Name</label>
                <input
                  type="text"
                  value={newQueueName}
                  onChange={e => setNewQueueName(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  placeholder="e.g. image-processing-queue"
                  required
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowQueueModal(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl px-4 py-3 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
