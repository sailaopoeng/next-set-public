"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState, type ReactNode } from "react";

export function SortableList<T extends { id: string }>({
  items,
  disabled = false,
  getLabel,
  getGroupId,
  onReorder,
  renderItem,
}: {
  items: T[];
  disabled?: boolean;
  getLabel: (item: T) => string;
  getGroupId?: (item: T) => string | null | undefined;
  onReorder: (items: T[]) => void;
  renderItem: (item: T, handle: ReactNode, compact: boolean) => ReactNode;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    setIsDragging(false);
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const previousIndex = items.findIndex((item) => item.id === active.id);
    const nextIndex = items.findIndex((item) => item.id === over.id);

    if (previousIndex < 0 || nextIndex < 0) return;
    const groupId = getGroupId?.(items[previousIndex]);
    if (!groupId) {
      const overGroupId = getGroupId?.(items[nextIndex]);
      if (overGroupId) {
        const movingItem = items[previousIndex];
        const remainingItems = items.filter((item) => item.id !== movingItem.id);
        const groupIndexes = remainingItems
          .map((item, index) => (getGroupId?.(item) === overGroupId ? index : -1))
          .filter((index) => index >= 0);
        const insertIndex =
          previousIndex < nextIndex
            ? Math.max(...groupIndexes) + 1
            : Math.min(...groupIndexes);
        const reordered = [...remainingItems];
        reordered.splice(insertIndex, 0, movingItem);
        onReorder(reordered);
        return;
      }
      onReorder(arrayMove(items, previousIndex, nextIndex));
      return;
    }

    const groupedItems = items.filter((item) => getGroupId?.(item) === groupId);
    if (groupedItems.some((item) => item.id === over.id)) return;
    const remainingItems = items.filter((item) => getGroupId?.(item) !== groupId);
    const overIndex = remainingItems.findIndex((item) => item.id === over.id);
    const insertIndex = previousIndex < nextIndex ? overIndex + 1 : overIndex;
    const reordered = [...remainingItems];
    reordered.splice(insertIndex, 0, ...groupedItems);
    onReorder(reordered);
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={() => setIsDragging(false)}
      onDragEnd={handleDragEnd}
      onDragStart={() => setIsDragging(true)}
      sensors={sensors}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => (
          <SortableItem
            disabled={disabled || items.length < 2}
            key={item.id}
            id={item.id}
            label={getLabel(item)}
          >
            {(handle) => renderItem(item, handle, isDragging)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const handle = (
    <button
      aria-label={`Reorder ${label}`}
      className="flex h-10 w-7 shrink-0 touch-none cursor-grab items-center justify-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
      disabled={disabled}
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
    >
      <GripVertical size={18} />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: isDragging ? "relative" : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {children(handle)}
    </div>
  );
}
