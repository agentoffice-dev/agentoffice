import { useState } from 'react'
import { Home, Folder as FolderIcon, ChevronDown } from 'lucide-react'
import type { Folder } from '@/types'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function flattenFolderTree(folders: Folder[]): Array<{ folder: Folder; depth: number }> {
  const childrenMap = new Map<string | null, Folder[]>()
  for (const folder of folders) {
    const key = folder.parentFolderId ?? null
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(folder)
  }
  const result: Array<{ folder: Folder; depth: number }> = []
  function traverse(parentId: string | null, depth: number) {
    for (const child of childrenMap.get(parentId) ?? []) {
      result.push({ folder: child, depth })
      traverse(child.id, depth + 1)
    }
  }
  traverse(null, 0)
  return result
}

interface FolderPickerButtonProps {
  folders: Folder[]
  value: string | null
  onChange: (folderId: string | null) => void
  disabled?: boolean
}

export default function FolderPickerButton({ folders, value, onChange, disabled }: FolderPickerButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const selectedFolder = folders.find(f => f.id === value) ?? null
  const folderTree = flattenFolderTree(folders)

  const handleSelect = (id: string | null) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors text-left',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        {selectedFolder ? (
          <FolderIcon className="w-4 h-4 shrink-0 text-amber-500" />
        ) : (
          <Home className="w-4 h-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-foreground">
          {selectedFolder?.name ?? t('workspace.root')}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t('folder.select')}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-4 space-y-0.5 max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors',
                value === null
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent text-foreground',
              )}
            >
              <Home className="w-4 h-4 shrink-0" />
              <span className="font-medium">{t('workspace.root')}</span>
            </button>
            {folderTree.map(({ folder, depth }) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => handleSelect(folder.id)}
                style={{ paddingLeft: `${12 + depth * 20}px` }}
                className={cn(
                  'w-full flex items-center gap-3 pr-3 py-2.5 rounded-md text-sm transition-colors',
                  value === folder.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent text-foreground',
                )}
              >
                <FolderIcon className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
