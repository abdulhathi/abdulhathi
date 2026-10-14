import gettingStarted from './content/00-getting-started.md?raw'
import workerService from './content/01-worker-service.md?raw'
import containerize from './content/02-containerize.md?raw'
import azureResources from './content/03-azure-resources.md?raw'
import k8sManifests from './content/04-kubernetes-manifests.md?raw'
import manualDeploy from './content/05-manual-deploy.md?raw'
import azureDevops from './content/06-azure-devops-cicd.md?raw'
import beyond from './content/07-beyond-the-basics.md?raw'

export type Difficulty = 'Setup' | 'Beginner' | 'Intermediate' | 'Advanced'

export interface Topic {
  id: string
  order: number
  title: string
  difficulty: Difficulty
  summary: string
  estimatedTime: string
  content: string
}

export const topics: Topic[] = [
  {
    id: 'getting-started',
    order: 0,
    title: 'Getting Started: Tools + Azure Setup',
    difficulty: 'Setup',
    summary:
      'Install and verify the toolchain (.NET SDK, Docker, Azure CLI, kubectl), understand the target architecture, and set up your Azure DevOps organization.',
    estimatedTime: '30-45 min',
    content: gettingStarted,
  },
  {
    id: 'worker-service',
    order: 1,
    title: 'Build the Worker Service',
    difficulty: 'Beginner',
    summary:
      'Create the Order Processor — a BackgroundService that polls for orders in batches, binds strongly-typed options, and shuts down gracefully on SIGTERM.',
    estimatedTime: '2-3 hours',
    content: workerService,
  },
  {
    id: 'containerize',
    order: 2,
    title: 'Containerize with Docker',
    difficulty: 'Beginner',
    summary:
      'Multi-stage Dockerfile: SDK image builds, runtime image runs as non-root. Override config with environment variables — the same mechanism a ConfigMap uses.',
    estimatedTime: '1-2 hours',
    content: containerize,
  },
  {
    id: 'azure-resources',
    order: 3,
    title: 'Create the Azure Resources (ACR + AKS)',
    difficulty: 'Intermediate',
    summary:
      'Provision a container registry and the smallest practical AKS cluster with the Azure CLI, and understand why --attach-acr saves you from ImagePullBackOff.',
    estimatedTime: '1-2 hours',
    content: azureResources,
  },
  {
    id: 'kubernetes-manifests',
    order: 4,
    title: 'Kubernetes Manifests for a Worker',
    difficulty: 'Intermediate',
    summary:
      'Namespace, ConfigMap, and Deployment — and why a background worker needs no Service or Ingress. Grace periods, resource limits, and security context.',
    estimatedTime: '2-3 hours',
    content: k8sManifests,
  },
  {
    id: 'manual-deploy',
    order: 5,
    title: 'Deploy Manually with kubectl',
    difficulty: 'Intermediate',
    summary:
      'Build the image in the cloud with az acr build, apply the manifests, stream logs from both replicas, and run experiments: config changes, scaling, rollbacks.',
    estimatedTime: '1-2 hours',
    content: manualDeploy,
  },
  {
    id: 'azure-devops-cicd',
    order: 6,
    title: 'CI/CD with Azure DevOps',
    difficulty: 'Advanced',
    summary:
      'Two-stage YAML pipeline: build and push to ACR, then deploy to AKS with the KubernetesManifest task. Service connections, environments, and first-run gotchas.',
    estimatedTime: '3-4 hours',
    content: azureDevops,
  },
  {
    id: 'beyond-the-basics',
    order: 7,
    title: 'Beyond the Basics: Queues, KEDA, Probes',
    difficulty: 'Advanced',
    summary:
      'Swap the simulated queue for Azure Service Bus, autoscale on queue length with KEDA, add health probes and Key Vault secrets — and clean up your Azure spend.',
    estimatedTime: '1-2 days',
    content: beyond,
  },
]
