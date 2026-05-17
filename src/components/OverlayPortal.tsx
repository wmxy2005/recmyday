import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';

type OverlayPortalItem = {
  id: number;
  node: ReactNode;
};

type OverlayPortalContextValue = {
  mount: (id: number, node: ReactNode) => void;
  unmount: (id: number) => void;
};

const OverlayPortalContext = createContext<OverlayPortalContextValue | null>(null);
let nextPortalId = 0;

export function OverlayPortalProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<OverlayPortalItem[]>([]);

  const value = useMemo<OverlayPortalContextValue>(
    () => ({
      mount: (id, node) => {
        setItems((currentItems) => {
          const existingIndex = currentItems.findIndex((item) => item.id === id);

          if (existingIndex === -1) {
            return [...currentItems, { id, node }];
          }

          if (currentItems[existingIndex].node === node) {
            return currentItems;
          }

          const nextItems = [...currentItems];
          nextItems[existingIndex] = { id, node };
          return nextItems;
        });
      },
      unmount: (id) => {
        setItems((currentItems) => currentItems.filter((item) => item.id !== id));
      },
    }),
    [],
  );

  return (
    <OverlayPortalContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <View pointerEvents="box-none" style={styles.host}>
          {items.map((item) => (
            <View key={item.id} pointerEvents="box-none" style={styles.item}>
              {item.node}
            </View>
          ))}
        </View>
      </View>
    </OverlayPortalContext.Provider>
  );
}

export function OverlayPortal({ children }: { children: ReactNode }) {
  const context = useContext(OverlayPortalContext);
  const idRef = useRef(0);

  if (idRef.current === 0) {
    nextPortalId += 1;
    idRef.current = nextPortalId;
  }

  useLayoutEffect(() => {
    if (context) {
      context.mount(idRef.current, children);
    }
  }, [children, context]);

  useEffect(() => {
    if (!context) {
      return undefined;
    }
    const id = idRef.current;

    return () => context.unmount(id);
  }, [context]);

  if (context) {
    return null;
  }

  return children;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
  item: {
    ...StyleSheet.absoluteFillObject,
  },
});
