import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  keymap,
  placeholder,
  WidgetType
} from "@codemirror/view";
import {
  findPreviewRegions,
  selectPreviewRegions,
  type PreviewRegion,
} from "../editor/livePreviewRanges";
import {
  renderMarkdown,
  renderMarkdownInline,
  renderMathPreview
} from "../editor/markdown";

interface LivePreviewEditorProps {
  value: string;
  onChange: (value: string) => void;
  onOpenLink: (target: string) => void;
}

export interface LivePreviewEditorHandle {
  focus: () => void;
  insertText: (before: string, after?: string) => void;
}

class PreviewWidget extends WidgetType {
  constructor(
    readonly region: PreviewRegion,
    readonly openLink: (target: string) => void
  ) {
    super();
  }

  eq(other: PreviewWidget) {
    return (
      this.region.from === other.region.from &&
      this.region.to === other.region.to &&
      this.region.kind === other.region.kind &&
      this.region.source === other.region.source
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const element = document.createElement(this.region.block ? "div" : "span");
    element.className = `live-preview-widget live-preview-${this.region.kind}`;

    if (this.region.kind === "inline-math" || this.region.kind === "block-math") {
      const preview = renderMathPreview(
        this.region.mathSource ?? "",
        this.region.kind === "block-math"
      );
      if (preview.error) {
        element.classList.add("live-preview-error");
        element.textContent = this.region.source;
        element.title = preview.error;
      } else {
        element.innerHTML = preview.html;
      }
    } else {
      element.innerHTML = this.region.block
        ? renderMarkdown(this.region.source)
        : renderMarkdownInline(this.region.source);
    }

    element.addEventListener("pointerdown", (event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[data-kitnote-link]");
      if (anchor && (pointerEvent.ctrlKey || pointerEvent.metaKey)) {
        event.preventDefault();
        this.openLink(anchor.dataset.kitnoteLink ?? anchor.href);
        return;
      }

      event.preventDefault();
      view.dispatch({
        selection: { anchor: Math.min(this.region.from + 1, this.region.to) },
        scrollIntoView: true
      });
      view.focus();
    });

    return element;
  }

  ignoreEvent() {
    return false;
  }
}

function buildDecorations(
  state: EditorState,
  openLink: (target: string) => void
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const region of selectPreviewRegions(state.selection, findPreviewRegions(state))) {
    builder.add(
      region.from,
      region.to,
      Decoration.replace({
        widget: new PreviewWidget(region, openLink),
        block: region.block
      })
    );
  }
  return builder.finish();
}

function livePreview(openLink: (target: string) => void) {
  const field = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, openLink);
    },
    update(decorations, transaction) {
      if (transaction.docChanged || transaction.selection) {
        return buildDecorations(transaction.state, openLink);
      }
      return decorations;
    },
    provide: (extension) => [
      EditorView.decorations.from(extension),
      EditorView.atomicRanges.of(
        (view) => view.state.field(extension)
      )
    ]
  });

  return field;
}

export const LivePreviewEditor = forwardRef<LivePreviewEditorHandle, LivePreviewEditorProps>(
  function LivePreviewEditor({ value, onChange, onOpenLink }, ref) {
    const parentRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onOpenLinkRef = useRef(onOpenLink);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onOpenLinkRef.current = onOpenLink;
    }, [onOpenLink]);

    useEffect(() => {
      if (!parentRef.current) return;
      const openLink = (target: string) => onOpenLinkRef.current(target);
      const state = EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          placeholder("Write Markdown, TeX, links, and notes..."),
          livePreview(openLink),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          })
        ]
      });
      const view = new EditorView({ state, parent: parentRef.current });
      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === value) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      });
    }, [value]);

    useImperativeHandle(
      ref,
      () => ({
        focus() {
          viewRef.current?.focus();
        },
        insertText(before: string, after = "") {
          const view = viewRef.current;
          if (!view) return;
          const selection = view.state.selection.main;
          const selected = view.state.doc.sliceString(selection.from, selection.to);
          const insert = `${before}${selected}${after}`;
          view.dispatch({
            changes: { from: selection.from, to: selection.to, insert },
            selection: EditorSelection.range(
              selection.from + before.length,
              selection.from + before.length + selected.length
            ),
            scrollIntoView: true
          });
          view.focus();
        }
      }),
      []
    );

    return <div ref={parentRef} className="live-preview-editor" />;
  }
);
