import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import { JSDOM } from "jsdom";
import fetch from "node-fetch";

const result = dotenv.config();
const child_page_id = "1a7d7b9bf065807f83b5fab5e6f4d0c3";
const parent_page_id = "1a7d7b9bf065808ebc60c7353e24fa3a";
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

async function main() {
  const response = await notion.pages.retrieve({
    page_id: "1a7d7b9bf065807f83b5fab5e6f4d0c3",
  });

  const url = "https://preply.com/en/blog/questions-in-german";
  const baseUrl = new URL(url).origin;
  const page = await fetch(url);
  if (!page.ok) throw new Error(`Failed to fetch page: ${page.statusText}`);

  const html = await page.text();

  await addNotionBlocksFromHTML(child_page_id, html, baseUrl);
  console.log("Got response:", response);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

/**
 * Converts HTML content to Notion blocks format.
 * @param html The HTML string to convert
 * @param url The base URL for resolving relative links
 * @returns An array of Notion block objects
 */
function htmlToNotionBlocks(html: string, url: string) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const blocks: any[] = [];

  // Maximum nesting depth for Notion lists (Notion API supports 3 levels)
  const MAX_NESTING_DEPTH = 2; // 0-based index, so this allows 3 levels total

  /**
   * Extracts rich text content from an element, preserving links and formatting.
   * @param element The HTML element to extract text from
   * @returns An array of Notion rich_text objects
   */
  function extractRichText(element: HTMLElement): any[] {
    const richText: any[] = [];

    // Loop through each child node (text nodes and elements)
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 3) { // Text node - simple text content
        const content = node.textContent?.trim();
        if (content) {
          richText.push({
            text: { content }
          });
        }
      } else if (node.nodeType === 1) { // Element node - might be a link or other element
        const childElement = node as HTMLElement;
        const tag = childElement.tagName.toLowerCase();

        if (tag === 'a') {
          // Handle links - create a rich text object with a link
          const href = childElement.getAttribute("href") || "";
          const text = childElement.textContent?.trim() || href;
          const fullUrl = href.startsWith("http") ? href : new URL(href, url).href;

          richText.push({
            text: {
              content: text,
              link: { url: fullUrl }
            }
          });
        }
        else if (!['ul', 'ol'].includes(tag)) {
          // Add other inline elements as plain text, but skip nested lists
          const content = childElement.textContent?.trim();
          if (content) {
            richText.push({
              text: { content }
            });
          }
        }
      }
    }

    return richText;
  }

  /**
   * Recursively processes an HTML node and converts it to Notion blocks.
   * @param node The HTML node to process
   * @returns An array of Notion blocks corresponding to the node
   */
  function processNode(node: Node): any[] {
    const result: any[] = [];

    if (node.nodeType === 1) {
      // Element Node
      const element = node as HTMLElement;
      const tag = element.tagName.toLowerCase();

      // Skip non-content elements
      if (["script", "style", "link", "meta"].includes(tag) || tag.includes("-")) {
        return result;
      }

      // Headings (h1, h2, h3)
      if (["h1", "h2", "h3"].includes(tag)) {
        const text = element.textContent?.trim();
        if (text) {
          result.push({
            object: "block",
            type: `heading_${tag[1]}`,
            [`heading_${tag[1]}`]: {
              // Use extractRichText to handle links inside headings
              rich_text: extractRichText(element),
            },
          });
        }
      }
      // Page title
      else if(tag === "title"){
        const text = element.textContent?.trim();
        if (text) {
          result.push({
            object: "block",
            type: `heading_1`,
            [`heading_1`]: {
              rich_text: [{ text: { content: text } }],
            },
          });
        }
      }
      // Paragraphs
      else if (tag === "p") {
        if (element.textContent?.trim()) {
          result.push({
            object: "block",
            type: "paragraph",
            paragraph: {
              // Use extractRichText to handle links inside paragraphs
              rich_text: extractRichText(element),
            },
          });
        }
      }
      // Lists (ul, ol)
      else if (tag === "ul" || tag === "ol") {
        const listType = tag === "ul" ? "bulleted_list_item" : "numbered_list_item";

        // Process list recursively with nesting depth tracking
        result.push(...processListWithDepthLimit(element, listType, 0));
      }
      // Select dropdowns
      else if (tag === "select") {
        console.log("element.id: "+element.id);
        const selectText = element.id ? element.id : "Select options:";
        // Extract all option elements and convert them to list items
        const options = Array.from(element.children)
          .filter((child) => child.tagName.toLowerCase() === "option")
          .map((option) => {
            const optionText = option.textContent?.trim() || "";
            return {
              object: "block",
              type: "bulleted_list_item",
              bulleted_list_item: {
                rich_text: [{ text: { content: optionText } }],
              },
            };
          });

        // Create a parent list item with nested option items
        if (options.length > 0) {
          const selectItem = {
            object: "block",
            type: "toggle",
            toggle: {
              rich_text: [{ text: { content: selectText } }],
              children: options,
            },
          };
          result.push(selectItem);
        }
      }
      // Links (only standalone ones)
      else if (tag === "a") {
        // Only process standalone links (not those inside lists, paragraphs, etc.)
        if (element.parentElement && ["body", "div"].includes(element.parentElement.tagName.toLowerCase())) {
          const href = element.getAttribute("href") || "";
          const text = element.textContent?.trim() || href;
          const fullUrl = href.startsWith("http") ? href : new URL(href, url).href;
          if (fullUrl!=void(0)) {
            console.log("Full url: "+fullUrl);
            result.push({
              object: "block", type: "paragraph", paragraph: {
                rich_text: [{
                  text: {
                    content: text, link: { url: fullUrl }
                  },
                },],
              },
            });

          }
        }
      }
      // Images
      else if (tag === "img") {
        const src = element.getAttribute("src");

        if (src) {
          let fullSrc: string|null;

          if (src.startsWith("http")) {
            fullSrc = src; // Absolute URL
          } else if (src.startsWith("data:image")) {
            console.warn("Skipping base64 image:", src.substring(0, 30) + "..."); // Prevent huge logs
            fullSrc = null;
          } else {
            fullSrc = new URL(src, url).href; // Resolve relative URLs
          }

          if (fullSrc) {
            console.log("Full src: " + fullSrc);
            result.push({
              object: "block",
              type: "image",
              image: {
                type: "external",
                external: { url: fullSrc },
              },
            });
          }
        }
      }

      // Tables
      else if (tag === "table") {
        const tableBlock = processTable(element as HTMLTableElement);
        if (tableBlock) result.push(tableBlock);
      }
      // Other elements - recursively process their children
      else {
        for (const child of element.childNodes) {
          const childBlocks = processNode(child);
          result.push(...childBlocks);
        }
      }
    }

    return result;
  }

  /**
   * Process a list with a depth limit to avoid Notion API validation errors
   * @param listElement The list element (ul/ol) to process
   * @param listType The type of list (bulleted_list_item or numbered_list_item)
   * @param currentDepth The current nesting depth
   * @returns An array of Notion blocks representing the list
   */
  function processListWithDepthLimit(listElement: HTMLElement, listType: string, currentDepth: number): any[] {
    const result: any[] = [];

    // Process each list item
    const listItems = Array.from(listElement.children)
      .filter((child) => child.tagName.toLowerCase() === "li");

    for (const li of listItems) {
      // Find any nested lists
      const nestedLists = Array.from(li.children).filter(
        child => child.tagName.toLowerCase() === "ul" || child.tagName.toLowerCase() === "ol"
      );

      // Create rich text for this list item
      const richText = extractRichText(li as HTMLElement);

      // Create the list item block
      const listItemBlock: any = {
        object: "block",
        type: listType,
        [listType]: {
          rich_text: richText,
        }
      };

      // Process nested lists if we haven't reached the maximum depth
      if (nestedLists.length > 0 && currentDepth < MAX_NESTING_DEPTH) {
        const nestedItems: any[] = [];

        for (const nestedList of nestedLists) {
          const nestedListType = nestedList.tagName.toLowerCase() === "ul"
            ? "bulleted_list_item"
            : "numbered_list_item";

          nestedItems.push(...processListWithDepthLimit(
            nestedList as HTMLElement,
            nestedListType,
            currentDepth + 1
          ));
        }

        // Add nested items as children
        if (nestedItems.length > 0) {
          listItemBlock[listType].children = nestedItems;
        }
      }
      // If we've reached max depth, convert nested lists to paragraphs to prevent API errors
      else if (nestedLists.length > 0 && currentDepth >= MAX_NESTING_DEPTH) {
        // Just use the text content without nesting further
        // The list items are already included in the richText
      }

      result.push(listItemBlock);
    }

    return result;
  }

  /**
   * Processes an HTML table element and converts it to a Notion table block.
   * @param table The HTML table element to process
   * @returns A Notion table block object
   */
  function processTable(table: HTMLTableElement): any {
    const rows = Array.from(table.querySelectorAll("tr"));
    const firstRowCells = rows[0]?.querySelectorAll("td, th") || [];
    const isFirstRowHeader = Array.from(firstRowCells).every(cell => cell.tagName === "TH");

    const tableChildren = rows.map((row) => ({
      object: "block",
      type: "table_row",
      table_row: {
        cells: Array.from(row.querySelectorAll("td, th")).map((cell) => [
          {
            type: "text",
            text: { content: cell.textContent?.trim() || "" },
          },
        ]),
      },
    }));

    return {
      object: "block",
      type: "table",
      table: {
        table_width: firstRowCells.length || 1,
        has_column_header: isFirstRowHeader,
        has_row_header: false,
        children: tableChildren,
      },
    };
  }


  // Start processing from the document body
  const body = document.body || document.documentElement;

  // Call processNode on the body to get all blocks
  const processedBlocks = processNode(body);

  // Add all processed blocks to the main blocks array
  blocks.push(...processedBlocks);

  return blocks;
}

/**
 * Adds HTML content as blocks to an existing Notion page
 * @param pageId The ID of the Notion page to add blocks to
 * @param html The HTML content to add
 * @param url The base URL for resolving relative links
 */
async function addNotionBlocksFromHTML(pageId: string, html: string, url: string) {
  try {
    const blocks = htmlToNotionBlocks(html, url);

    // Add blocks in batches of 100 (Notion API limit)
    let i = 0;
    while (i < blocks.length) {
      await notion.blocks.children.append({
        block_id: pageId,
        children: blocks.slice(i, i + 100),
      });
      i += 100;
    }

    console.log("Added HTML content to Notion page:", pageId);
  } catch (error) {
    console.error("Failed to add blocks to Notion page:", error);
  }
}