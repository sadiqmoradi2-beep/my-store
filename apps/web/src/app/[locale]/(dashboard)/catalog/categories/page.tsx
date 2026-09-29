'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { PERMISSIONS } from '@my-store/shared';
import type { CategoryDto, Locale } from '@my-store/shared';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { Button, Card, ErrorText, Field, Input, Modal, Spinner, cn } from '@/components/ui';
import { useRequirePermission } from '@/hooks/use-require-permission';

export default function CategoriesPage() {
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const allowed = useRequirePermission(PERMISSIONS.CATEGORIES_READ);

  const { data: tree, isPending, error } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<CategoryDto[]>('/categories/tree'),
    enabled: allowed,
  });

  if (!allowed) {
    return <p className="p-8 text-center text-sm text-ink-faint">{tc('accessDenied')}</p>;
  }

  const [modalParent, setModalParent] = useState<CategoryDto | null | 'root'>(null);

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black text-ink">{t('title')}</h1>
        <Button onClick={() => setModalParent('root')}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('new')}
        </Button>
      </div>

      <ErrorText error={error} />
      <ErrorText error={removeMutation.error} />
      {isPending ? (
        <Spinner />
      ) : (
        <Card className="p-3">
          {tree?.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-faint">{tc('noData')}</p>
          ) : (
            <ul className="space-y-1">
              {tree?.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  onAddChild={(n) => setModalParent(n)}
                  onDelete={(n) => {
                    if (confirm(t('deleteConfirm'))) removeMutation.mutate(n.id);
                  }}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      <CategoryModal
        open={modalParent !== null}
        parent={modalParent === 'root' ? null : modalParent}
        onClose={() => setModalParent(null)}
      />
    </div>
  );
}

function TreeNode({
  node,
  depth,
  onAddChild,
  onDelete,
}: {
  node: CategoryDto;
  depth: number;
  onAddChild: (node: CategoryDto) => void;
  onDelete: (node: CategoryDto) => void;
}) {
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <li>
      <div
        className="group flex min-h-11 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-surface-3/70"
        style={{ paddingInlineStart: `${depth * 1.5 + 0.5}rem` }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'collapse' : 'expand'}
          className={cn(
            'cursor-pointer rounded p-0.5 text-ink-faint transition-transform duration-200',
            !hasChildren && 'invisible',
            !open && 'ltr:-rotate-90 rtl:rotate-90',
          )}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <FolderOpen className="h-4 w-4 shrink-0 text-accent-500" aria-hidden />
        <span className="text-sm font-medium text-ink">{node.name}</span>
        <span className="text-xs text-ink-faint">
          {t('productCount', { count: formatNumber(node.productCount ?? 0, locale) })}
        </span>
        <div className="ms-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onAddChild(node)}
            aria-label={t('newChild')}
            title={t('newChild')}
            className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-primary-100 hover:text-primary-800 dark:hover:bg-primary-800/40"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(node)}
            aria-label={tc('delete')}
            className="cursor-pointer rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {open && hasChildren && (
        <ul className="space-y-1">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CategoryModal({
  open,
  parent,
  onClose,
}: {
  open: boolean;
  parent: CategoryDto | null;
  onClose: () => void;
}) {
  const t = useTranslations('categories');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/categories', { name, slug, parentId: parent?.id ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setName('');
      setSlug('');
      onClose();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal open={open} title={parent ? `${t('newChild')}: ${parent.name}` : t('new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('name')}>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('slug')}>
          <Input required dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <ErrorText error={mutation.error} />
        <div className="flex gap-2">
          <Button type="submit" loading={mutation.isPending}>
            {tc('create')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
