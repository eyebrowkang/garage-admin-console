import { useBrowser } from '../../context';
import { FileCard } from './FileCard';
import type { ListItem } from '../../types';

interface GridViewProps {
  items: ListItem[];
}

export function GridView({ items }: GridViewProps) {
  const { multiSelectMode, selectedKeys } = useBrowser();
  const visibleKeys = items.map((item) => (item.type === 'folder' ? item.prefix : item.key));

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">
        {items.map((item) => {
          const key = item.type === 'folder' ? item.prefix : item.key;
          return (
            <FileCard
              key={key}
              item={item}
              isSelected={selectedKeys.has(key)}
              showCheckbox={multiSelectMode}
              visibleKeys={visibleKeys}
            />
          );
        })}
      </div>
    </div>
  );
}
