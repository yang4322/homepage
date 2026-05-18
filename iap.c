#include "r_cg_userdefine.h"
#include "r_cg_macrodriver.h"
#include "r_cg_port.h"
#include "r_cg_adc.h"
#include "iap.h"
#include "fsl.h"
#include "fsl_types.h"
#include "r_cg_timer.h"
#include "r_cg_wdt.h"
#include "string.h"
#include "stdio.h"

extern  void  Clear_RunIap(void);
void Send_Soc_Ack(unsigned char module,unsigned char id,unsigned char ack);
#define MAX_CRC_BUFF_LEN 100

unsigned char start_flag,flag_acc=0;
uint32_t	Address=FLASH_STATR_AREA;
void Send_8268k_IAP_Query_Data(unsigned char write_state);
extern void UART0_Send_String(__far uint8_t buffer[], uint16_t tx_num); 
extern void JumptoAPP(void);
extern void Clear_RAM_upflag(void);
extern void FSL_Writer_KeyCode(void);
fsl_u08 WriteFlash(uint32_t addr, int8_t data[], uint8_t size);
typedef struct
{
    unsigned char         protocol_type;                      // com number
    unsigned char        protocol_moudle;             //  protocol_moudle   
    unsigned char         protocol_command;             // protocol command
    unsigned int         frame_page;                           // frame data length
    unsigned int         frame_query_page;
    unsigned char         data_length;                       // frame data length
    unsigned char         com_data[LDR_COMMUNICATION_BUFF_SIZE]; // data frame buffer
    unsigned char         com_crc8_data[LDR_COMMUNICATION_BUFF_SIZE]; // data frame buffer
    unsigned char         msg_cks;                            // frame checksum
    unsigned char         msg_total_cks; 
    unsigned char         msg_keycode_crc8;
	uint16_t              file_lenth;
} Uart_message;

Uart_message ucLDR_Message;

 
char mcu_version[50]=   {"V0.0.1"}; 

unsigned char  keycode[16]={0x20,0x11,0x0A,0xE4,0xE8,0x0B,0x88,0x18,0x0C,0x88,0x18,0x0D,0x20,0x11,0x05,0x19};

unsigned char crc8_0x2F_table[] =
{
	 0x00,0x2F,0x5E,0x71,0xBC,0x93,0xE2,0xCD,0x57,0x78,0x09,0x26,0xEB,0xC4,0xB5,0x9A, 
	 0xAE,0x81,0xF0,0xDF,0x12,0x3D,0x4C,0x63,0xF9,0xD6,0xA7,0x88,0x45,0x6A,0x1B,0x34, 
	 0x73,0x5C,0x2D,0x02,0xCF,0xE0,0x91,0xBE,0x24,0x0B,0x7A,0x55,0x98,0xB7,0xC6,0xE9, 
	 0xDD,0xF2,0x83,0xAC,0x61,0x4E,0x3F,0x10,0x8A,0xA5,0xD4,0xFB,0x36,0x19,0x68,0x47, 
	 0xE6,0xC9,0xB8,0x97,0x5A,0x75,0x04,0x2B,0xB1,0x9E,0xEF,0xC0,0x0D,0x22,0x53,0x7C,
	 0x48,0x67,0x16,0x39,0xF4,0xDB,0xAA,0x85,0x1F,0x30,0x41,0x6E,0xA3,0x8C,0xFD,0xD2,
	 0x95,0xBA,0xCB,0xE4,0x29,0x06,0x77,0x58,0xC2,0xED,0x9C,0xB3,0x7E,0x51,0x20,0x0F, 
	 0x3B,0x14,0x65,0x4A,0x87,0xA8,0xD9,0xF6,0x6C,0x43,0x32,0x1D,0xD0,0xFF,0x8E,0xA1, 
	 0xE3,0xCC,0xBD,0x92,0x5F,0x70,0x01,0x2E,0xB4,0x9B,0xEA,0xC5,0x08,0x27,0x56,0x79,
	 0x4D,0x62,0x13,0x3C,0xF1,0xDE,0xAF,0x80,0x1A,0x35,0x44,0x6B,0xA6,0x89,0xF8,0xD7,
	 0x90,0xBF,0xCE,0xE1,0x2C,0x03,0x72,0x5D,0xC7,0xE8,0x99,0xB6,0x7B,0x54,0x25,0x0A,
	 0x3E,0x11,0x60,0x4F,0x82,0xAD,0xDC,0xF3,0x69,0x46,0x37,0x18,0xD5,0xFA,0x8B,0xA4, 
	 0x05,0x2A,0x5B,0x74,0xB9,0x96,0xE7,0xC8,0x52,0x7D,0x0C,0x23,0xEE,0xC1,0xB0,0x9F,
	 0xAB,0x84,0xF5,0xDA,0x17,0x38,0x49,0x66,0xFC,0xD3,0xA2,0x8D,0x40,0x6F,0x1E,0x31,
	 0x76,0x59,0x28,0x07,0xCA,0xE5,0x94,0xBB,0x21,0x0E,0x7F,0x50,0x9D,0xB2,0xC3,0xEC,
	 0xD8,0xF7,0x86,0xA9,0x64,0x4B,0x3A,0x15,0x8F,0xA0,0xD1,0xFE,0x33,0x1C,0x6D,0x42 
};

static uint8_t g_image_header[IMAGE_HEADER_SIZE_BYTES];
static uint8_t g_image_header_bytes;
static uint8_t g_image_header_ready;
static uint32_t g_image_expected_size;
static uint32_t g_image_expected_crc32;
static uint32_t g_image_expected_start;
static uint32_t g_image_crc32_state;
static uint32_t g_image_crc32_actual;
static uint32_t g_image_crc32_bytes;
static uint8_t g_image_crc32_valid;
static uint8_t g_image_crc8_actual;

uint8_t crc8_table[256] = {
    0x00, 0x07, 0x0E, 0x09, 0x1C, 0x1B, 0x12, 0x15,
    0x38, 0x3F, 0x36, 0x31, 0x24, 0x23, 0x2A, 0x2D,
    0x70, 0x77, 0x7E, 0x79, 0x6C, 0x6B, 0x62, 0x65,
    0x48, 0x4F, 0x46, 0x41, 0x54, 0x53, 0x5A, 0x5D,
    0xE0, 0xE7, 0xEE, 0xE9, 0xFC, 0xFB, 0xF2, 0xF5,
    0xD8, 0xDF, 0xD6, 0xD1, 0xC4, 0xC3, 0xCA, 0xCD,
    0x90, 0x97, 0x9E, 0x99, 0x8C, 0x8B, 0x82, 0x85,
    0xA8, 0xAF, 0xA6, 0xA1, 0xB4, 0xB3, 0xBA, 0xBD,
    0xC7, 0xC0, 0xC9, 0xCE, 0xDB, 0xDC, 0xD5, 0xD2,
    0xFF, 0xF8, 0xF1, 0xF6, 0xE3, 0xE4, 0xED, 0xEA,
    0xB7, 0xB0, 0xB9, 0xBE, 0xAB, 0xAC, 0xA5, 0xA2,
    0x8F, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9D, 0x9A,
    0x27, 0x20, 0x29, 0x2E, 0x3B, 0x3C, 0x35, 0x32,
    0x1F, 0x18, 0x11, 0x16, 0x03, 0x04, 0x0D, 0x0A,
    0x57, 0x50, 0x59, 0x5E, 0x4B, 0x4C, 0x45, 0x42,
    0x6F, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7D, 0x7A,
    0x89, 0x8E, 0x87, 0x80, 0x95, 0x92, 0x9B, 0x9C,
    0xB1, 0xB6, 0xBF, 0xB8, 0xAD, 0xAA, 0xA3, 0xA4,
    0xF9, 0xFE, 0xF7, 0xF0, 0xE5, 0xE2, 0xEB, 0xEC,
    0xC1, 0xC6, 0xCF, 0xC8, 0xDD, 0xDA, 0xD3, 0xD4,
    0x69, 0x6E, 0x67, 0x60, 0x75, 0x72, 0x7B, 0x7C,
    0x51, 0x56, 0x5F, 0x58, 0x4D, 0x4A, 0x43, 0x44,
    0x19, 0x1E, 0x17, 0x10, 0x05, 0x02, 0x0B, 0x0C,
    0x21, 0x26, 0x2F, 0x28, 0x3D, 0x3A, 0x33, 0x34,
    0x4E, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5C, 0x5B,
    0x76, 0x71, 0x78, 0x7F, 0x6A, 0x6D, 0x64, 0x63,
    0x3E, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2C, 0x2B,
    0x06, 0x01, 0x08, 0x0F, 0x1A, 0x1D, 0x14, 0x13,
    0xAE, 0xA9, 0xA0, 0xA7, 0xB2, 0xB5, 0xBC, 0xBB,
    0x96, 0x91, 0x98, 0x9F, 0x8A, 0x8D, 0x84, 0x83,
    0xDE, 0xD9, 0xD0, 0xD7, 0xC2, 0xC5, 0xCC, 0xCB,
    0xE6, 0xE1, 0xE8, 0xEF, 0xFA, 0xFD, 0xF4, 0xF3
};

static uint32_t Boot_ReadLe32(const uint8_t *data)
{
	return ((uint32_t)data[0]) |
	       ((uint32_t)data[1] << 8) |
	       ((uint32_t)data[2] << 16) |
	       ((uint32_t)data[3] << 24);
}

static uint32_t Boot_Crc32_Update(uint32_t crc, const uint8_t *data, uint32_t length)
{
	uint32_t index;
	uint8_t bit;

	for (index = 0UL; index < length; index++)
	{
		crc ^= data[index];
		for (bit = 0U; bit < 8U; bit++)
		{
			if ((crc & 1UL) != 0UL)
			{
				crc = (crc >> 1) ^ 0xEDB88320UL;
			}
			else
			{
				crc >>= 1;
			}
		}
	}

	return crc;
}

static uint8_t Boot_Crc8_Update(uint8_t crc, uint8_t value)
{
	return crc8_table[crc ^ value];
}

static void Boot_ImageCrc32_ParseHeader(void)
{
	g_image_expected_size = Boot_ReadLe32(&g_image_header[IMAGE_HEADER_FILE_SIZE_OFFSET]);
	g_image_expected_crc32 = Boot_ReadLe32(&g_image_header[IMAGE_HEADER_CRC32_OFFSET]);
	g_image_expected_start = Boot_ReadLe32(&g_image_header[IMAGE_HEADER_START_ADDR_OFFSET]);
	g_image_header_ready = 1U;

	if ((g_image_expected_start != APP_A_START_ADDRESS) ||
	    (g_image_expected_size == 0UL) ||
	    (g_image_expected_size > APP_SLOT_SIZE_BYTES))
	{
		g_image_crc32_valid = 0U;
	}
}

void Boot_ImageCrc32_Reset(void)
{
	uint8_t index;

	for (index = 0U; index < IMAGE_HEADER_SIZE_BYTES; index++)
	{
		g_image_header[index] = 0x00U;
	}
	g_image_header_bytes = 0U;
	g_image_header_ready = 0U;
	g_image_expected_size = 0UL;
	g_image_expected_crc32 = 0UL;
	g_image_expected_start = APP_A_START_ADDRESS;
	g_image_crc32_state = 0xFFFFFFFFUL;
	g_image_crc32_actual = 0UL;
	g_image_crc32_bytes = 0UL;
	g_image_crc32_valid = 0U;
	g_image_crc8_actual = 0xFFU;
}

void Boot_ImageCrc32_Consume(uint32_t flash_address, const uint8_t *data, uint8_t size)
{
	uint32_t offset;
	uint32_t address;

	if ((data == 0) || (size == 0U))
	{
		return;
	}

	for (offset = 0UL; offset < size; offset++)
	{
		address = flash_address + offset;
		if ((address >= FLASH_STATR_AREA) &&
		    (address < (FLASH_STATR_AREA + IMAGE_HEADER_SIZE_BYTES)) &&
		    (g_image_header_bytes < IMAGE_HEADER_SIZE_BYTES))
		{
			g_image_header[g_image_header_bytes++] = data[offset];
			if (g_image_header_bytes >= IMAGE_HEADER_SIZE_BYTES)
			{
				Boot_ImageCrc32_ParseHeader();
			}
		}

		if ((g_image_header_ready != 0U) &&
		    (g_image_expected_start == APP_A_START_ADDRESS) &&
		    (address >= APP_A_START_ADDRESS) &&
		    (g_image_crc32_bytes < g_image_expected_size))
		{
			g_image_crc32_state = Boot_Crc32_Update(g_image_crc32_state, &data[offset], 1U);
			g_image_crc8_actual = Boot_Crc8_Update(g_image_crc8_actual, data[offset]);
			g_image_crc32_bytes++;
			g_image_crc32_actual = g_image_crc32_state ^ 0xFFFFFFFFUL;
			g_image_crc32_valid = (uint8_t)((g_image_crc32_bytes == g_image_expected_size) &&
			                               (g_image_crc32_actual == g_image_expected_crc32));
		}
	}
}

uint8_t Boot_ImageCrc32_IsValid(void)
{
	return g_image_crc32_valid;
}

uint32_t Boot_ImageCrc32_GetActual(void)
{
	return g_image_crc32_actual;
}

uint32_t Boot_ImageCrc32_GetExpected(void)
{
	return g_image_expected_crc32;
}

uint8_t Boot_ImageCrc8_GetActual(void)
{
	return g_image_crc8_actual;
}



uint8_t Cal_Crc8_Table(uint8_t *data_buff, uint8_t len)

{
    unsigned char  i=0,crc = 0xFF;
    for (i=0;i<len;i++)
    {
        crc = crc8_0x2F_table[crc ^ *data_buff++];
    }
    return (~crc);
}


unsigned char flag_app_ok=0;
unsigned char UpdateInfo_TimeOut_Flag=0;
unsigned char UpdateInfo_TimeOut_Count=0;

static uint8_t FSL_Erase_BlockRange(uint16_t start_block, uint16_t end_block)
{
	uint16_t block;
	fsl_u08 status;

	for (block = start_block; block <= end_block; block++)
	{
		status = FSL_Erase(block);
		if (status != FSL_OK)
		{
			return status;
		}
		R_WDT_Restart();
	}

	return FSL_OK;
}

static uint8_t FSL_Copy_CodeRegion(uint32_t src_address, uint32_t dst_address, uint32_t size)
{
	uint8_t buffer[FLASH_WRITE_CHUNK_BYTES];
	uint8_t index;
	uint8_t status;
	uint32_t offset;

	for (offset = 0UL; offset < size; offset += FLASH_WRITE_CHUNK_BYTES)
	{
		for (index = 0U; index < FLASH_WRITE_CHUNK_BYTES; index++)
		{
			buffer[index] = *(__far uint8_t *)(src_address + offset + index);
		}

		status = WriteFlash(dst_address + offset, (int8_t *)buffer, FLASH_WRITE_CHUNK_BYTES);
		if (status != FSL_OK)
		{
			return status;
		}

		R_WDT_Restart();
	}

	return FSL_OK;
}

static uint8_t FSL_OpenForMaintenance(void)
{
	fsl_descriptor_t fsl_descr;
	fsl_u08 status;

	fsl_descr.fsl_flash_voltage_u08 = 0x00;
	fsl_descr.fsl_frequency_u08 = 0x08;
	fsl_descr.fsl_auto_status_check_u08 = 0x01;

	status = FSL_Init((__far fsl_descriptor_t*)&fsl_descr);
	if (status != FSL_OK)
	{
		return status;
	}

	FSL_Open();
	FSL_PrepareFunctions();
	FSL_PrepareExtFunctions();
	return FSL_OK;
}

uint8_t FSL_Backup_AppToB(void)
{
	uint8_t status;

	status = FSL_Erase_BlockRange(APP_B_START_BLOCK, APP_B_END_BLOCK);
	if (status != FSL_OK)
	{
		return DATA_ERR;
	}

	status = FSL_Copy_CodeRegion(APP_A_START_ADDRESS, APP_B_START_ADDRESS, APP_SLOT_SIZE_BYTES);
	return (status == FSL_OK) ? DATA_OK : DATA_ERR;
}

uint8_t FSL_Rollback_AppBToA(void)
{
	uint8_t status;

	status = FSL_OpenForMaintenance();
	if (status != FSL_OK)
	{
		return DATA_ERR;
	}

	status = FSL_Erase_BlockRange(APP_A_START_BLOCK, APP_A_END_BLOCK);
	if (status == FSL_OK)
	{
		status = FSL_Copy_CodeRegion(APP_B_START_ADDRESS, APP_A_START_ADDRESS, APP_SLOT_SIZE_BYTES);
	}

	FSL_Close();
	return (status == FSL_OK) ? DATA_OK : DATA_ERR;
}


fsl_u08 WriteFlash(uint32_t addr, int8_t data[], uint8_t size)
{
	
	__near fsl_write_t my_fsl_write_str;	
	
	my_fsl_write_str.fsl_data_buffer_p_u08 = (__near fsl_u08 *) data;
	my_fsl_write_str.fsl_word_count_u08 = size/4;
	my_fsl_write_str.fsl_destination_address_u32 = (addr&0x00ffffff);
	
	//FSL_Write((__near fsl_write_t*) &my_fsl_write_str);
		
	return FSL_Write((__near fsl_write_t*) &my_fsl_write_str);
}



uint8_t RcvData (void)
{
	uint8_t data;
	uint32_t tick_count;

	
	tick_count = 10000;
	R_TAU0_Channel0_Start();
	
	/* wait for a byte to arrive */
	while ((SRIF0 == 0) && (tick_count))
	{
		WDTE = 0xac;

		if (TMIF00 == 1)
		{
			TMIF00 = 0;
			R_TAU0_Channel0_Stop();
			if (--tick_count)
			{
				R_TAU0_Channel0_Start();
			}
		}
	}
	
	if (tick_count == 0)
	{
		data = '0';
		return 0;
	}
		
	data=(uint8_t) SDR01L;
	SRIF0 = 0;

	return data;

}
unsigned char Message_Rcv(void)
{
    unsigned char	ucdata;
    unsigned char	uci;
	uint8_t crc_buff[MAX_CRC_BUFF_LEN]; // 固定长度缓冲区，适配所有编译器
	uint8_t crc_total_len = 0; // 实际需要校验的总长度

    start_flag=0;
    ucdata=RcvData();
    if(ucdata!=AM1_IAP_HEAD1)
        return 0;
    ucdata=RcvData();//HEAD2
    if(ucdata!=AM1_IAP_HEAD2)
        return 0;	
    start_flag=1;

    ucdata=RcvData();
    if((start_flag==0)||(ucdata==1))
        return 0;
   ucLDR_Message.protocol_type=ucdata;
	
    ucdata=RcvData(); //LEN
    if(start_flag==0)
        return 0;
    ucLDR_Message.data_length=ucdata;
	crc_total_len = ucLDR_Message.data_length;
    ucdata=RcvData();//Module
    if(start_flag==0)
        return 0;
    ucLDR_Message.protocol_moudle=  ucdata;
	crc_buff[0] = ucdata; // CRC缓冲区第0位：protocol_moudle
	ucLDR_Message.com_crc8_data[0] = ucdata; // CRC缓冲区第0位：protocol_moudle
    ucdata=RcvData();
    if(start_flag==0)
        return 0;
    ucLDR_Message.protocol_command=  ucdata;
	crc_buff[1] = ucdata; // CRC缓冲区第1位：protocol_command
	ucLDR_Message.com_crc8_data[1] = ucdata; // CRC缓冲区第1位：protocol_command


    for( uci=0 ; uci<(ucLDR_Message.data_length-2) ; uci++ )//data
    {
	ucdata = RcvData();

	if(start_flag==0)
	return 0;
	ucLDR_Message.com_data[uci] = ucdata;
	ucLDR_Message.com_crc8_data[uci] = ucdata;
	crc_buff[2 + uci] = ucdata; // CRC缓冲区第2+uci位：com_data[uci]
    }
	if(crc_total_len == 0 || crc_total_len > MAX_CRC_BUFF_LEN) {
		start_flag = 0;
		return 0;
	}
	ucLDR_Message.msg_cks = Cal_Crc8_Table(crc_buff, crc_total_len);

    ucdata = RcvData();
    if(start_flag==0)
        return 0;

	if(ucLDR_Message.protocol_type==ACK)
	{
		 return 0;
	}
    if(ucLDR_Message.msg_cks==ucdata)
    	{
    	     
	 //     ucLDR_Message.msg_cks=0xff;//xuyanjun add 2013-06-02		
	      if( ucLDR_Message.protocol_command !=0x84)
    	       Send_Soc_Ack(ucLDR_Message.protocol_moudle,ucLDR_Message.protocol_command,ACK1);	  
     	      return 1;
    	}
    else
    	{
    	    
    	 //  		   ucLDR_Message.msg_cks=0xff;//xuyanjun add 2013-06-02
			if(ucLDR_Message.protocol_command ==0x84)
			{
				Send_8268k_IAP_Query_Data(DATA_ERR);
			}	
			else
			{
				Send_Soc_Ack(ucLDR_Message.protocol_moudle,ucLDR_Message.protocol_command,NACK1);	
			}
			return 0;
    	}

}



void Send_Soc_Ack(unsigned char module,unsigned char id,unsigned char ack)
{
	unsigned char ack_buff[8];
	ack_buff[0]=ANDROID_UART_HEAD1;
	ack_buff[1]=ANDROID_UART_HEAD2;
	ack_buff[2]=ACK ;	
	ack_buff[3]=0x03 ;
	ack_buff[4]=module;	  //module 
	ack_buff[5]=id;//ID
	ack_buff[6]=ack;
	ack_buff[7]=Cal_Crc8_Table(&ack_buff[4], ack_buff[3]);
//	ack_buff[7]=(ack_buff[4]+ack_buff[5]+ack_buff[6])^0XFF;
	UART0_Send_String(ack_buff,ack_buff[3]+5);
}
void Send_Soc_Heat_cmd(void )
{
	unsigned char  heat_buff[8];
	heat_buff[0]=ANDROID_UART_HEAD1;
	heat_buff[1]=ANDROID_UART_HEAD2;
	heat_buff[2]=CMD ;	
	heat_buff[3]=0x03 ;
	heat_buff[4]=SEND_TYPE_KEY_INFO;	  //module 
	heat_buff[5]=ID_send_heat_info;//ID
	heat_buff[6]=0x01;
	heat_buff[7]=Cal_Crc8_Table(&heat_buff[4], heat_buff[3]);
//	heat_buff[7]=(heat_buff[4]+heat_buff[5]+heat_buff[6])^0XFF;
	UART0_Send_String(heat_buff,heat_buff[3]+5);
}
void Send_8268k_Version(void)
{
    unsigned char version_buff[60],i,str_len=0;	
	str_len=strlen(mcu_version);	
	version_buff[0]=ANDROID_UART_HEAD1;
	version_buff[1]=ANDROID_UART_HEAD2;
	version_buff[2]=CMD;
	version_buff[3]=(0X02+str_len) ;	//LEN	
	version_buff[4]=SEND_TYPE_KEY_INFO;//TYPE	
	version_buff[5]=ID_send_mcu_version_info;//ID	
//	checksum=version_buff[4]+version_buff[5];
	for(i=0; i<str_len; i++)
    	{
		version_buff[6+i]=mcu_version[i];
//		checksum+=version_buff[6+i];	
    	}
	version_buff[6+str_len]=Cal_Crc8_Table(&version_buff[4], version_buff[3]);
//	version_buff[6+i]=(checksum^0xff);
    UART0_Send_String(version_buff,version_buff[3]+5);
   // Delay20ms();
   
}

#ifdef DEBUG_BOOT
void Send_8268k_DEBUG_cmd(unsigned char cmd,unsigned char data)
{
	unsigned char  heat_buff[5],check_sum=0;
	heat_buff[0]=AM1_IAP_HEAD;
	heat_buff[1]=cmd ;		
	heat_buff[2]=0X01;//LEN	  
	heat_buff[3]=data;//DATA
	check_sum=(heat_buff[1]+heat_buff[2]+heat_buff[3])&0xff;
	heat_buff[4]=check_sum^0xff; 
	UART0_Send_String(heat_buff,heat_buff[2]+4);
   //    Delay20ms();
	
}
#endif
void Send_8268k_DEBUG_crc8(void)
{
	unsigned char  heat_buff[5];
	heat_buff[0]=0x2e;
	heat_buff[1]=0x2e;		
	heat_buff[2]=ucLDR_Message.msg_keycode_crc8;//LEN	  
	heat_buff[3]=0;//DATA
	heat_buff[4]=ucLDR_Message.msg_total_cks; 
	UART0_Send_String(heat_buff,5);
   //    Delay20ms();
	
}

void Send_8268k_IAP_cmd(unsigned char cmd,unsigned char data)
{
	unsigned char  cmd_buff[10];
    cmd_buff[0]=ANDROID_UART_HEAD1;
    cmd_buff[1]=ANDROID_UART_HEAD2;
    cmd_buff[2]=CMD;
    cmd_buff[3]=0x03;	//len  	
    cmd_buff[4]=SEND_TYPE_SYSTEM_INFO ; //type  
    cmd_buff[5]=cmd ; //cmd     
    cmd_buff[6]=data;//DATA
//    check_sum=(cmd_buff[4]+cmd_buff[5]+cmd_buff[6])&0xff;
//    cmd_buff[7]=check_sum^0xff; 
	cmd_buff[7]=Cal_Crc8_Table(&cmd_buff[4], cmd_buff[3]);
    UART0_Send_String(cmd_buff,cmd_buff[3]+5);
     //  Delay20ms();
	
}
void Send_8268k_IAP_Query_Data(unsigned char write_state)
{
	unsigned char  heat_buff[10];
	unsigned int  data_page=0;
	
	if(write_state==0)
		{
			data_page=0XFFFF;
		}
	else
		{
			data_page=ucLDR_Message.frame_query_page;

		}
		
	heat_buff[0]=ANDROID_UART_HEAD1;
	heat_buff[1]=ANDROID_UART_HEAD2;
	heat_buff[2]=CMD;
	heat_buff[3]=0x04;	//len  	
	heat_buff[4]=SEND_TYPE_SYSTEM_INFO ; //type  
	heat_buff[5]=MCU_TO_ARM_Request_Data ; //cmd       
	heat_buff[6]=(data_page>>8)&0xff;//h
	heat_buff[7]=data_page&0xff;//l	
//	check_sum=(heat_buff[4]+heat_buff[5]+heat_buff[6]+heat_buff[7])&0xff;
//	heat_buff[8]=check_sum^0xff; 
	heat_buff[8]=Cal_Crc8_Table(&heat_buff[4], heat_buff[3]);
	UART0_Send_String(heat_buff,heat_buff[3]+5);
     //  Delay20ms();
	
}

unsigned char  Check_key_code(void)
{
	unsigned char i=0;
	for(i=0;i<16;i++)
		{
			if(ucLDR_Message.com_data[32+i]!=keycode[i])
				{
					return DATA_ERR;
				}
		}
	ucLDR_Message.msg_keycode_crc8=ucLDR_Message.msg_cks;
	return DATA_OK;

}

void FSL_Erase_App(void)
{
	unsigned char i,fsl_status;
	for (i = (unsigned char)APP_IMAGE_START_BLOCK; i <= (unsigned char)APP_A_END_BLOCK; i++)
	{
		fsl_status = FSL_Erase(i);
		if (fsl_status != FSL_OK)
		{
			Send_8268k_IAP_cmd(MCU_TO_ARM_CHECK_KEY,AM1_KEY_VERIFY_ERR);
		}
		NOP();
		NOP();
		NOP();
		NOP();
	}
}

void  UpDataFile_CheckSum(uint8_t *Updata_buff,uint8_t Lenth) 
{	
	uint8_t i=0;

	for(i=0;i<Lenth;i++)
	{	
	    ucLDR_Message.msg_total_cks+=Updata_buff[i];
	}

}
void FSL_Writer_KeyCode(void)
{
	uint32_t	qw=128;
	uint8_t	status=0;
	if (Address<= (0x400*qw-1))
	{
	Boot_ImageCrc32_Consume(Address, &ucLDR_Message.com_data[0], IMAGE_HEADER_SIZE_BYTES);
	status = WriteFlash(Address, (int8_t*)&ucLDR_Message.com_data[0], 64);
	if(status==FSL_OK)
		{
			Address += 64; 
#ifdef SUPPORT_MCU_QUERY													
			UpdateInfo_TimeOut_Flag=1;
			UpdateInfo_TimeOut_Count=0;
#endif	
			Send_8268k_IAP_Query_Data(DATA_OK); 	
		}
	}
		
}

void FSL_Writer_App(void)
{
	uint32_t	qw=128;
	uint8_t	status=0;

	if (Address<= (0x400*qw-1))
		{
			ucLDR_Message.frame_page=((ucLDR_Message.com_data[0]<<8)|ucLDR_Message.com_data[1]);
			if(ucLDR_Message.frame_page==ucLDR_Message.frame_query_page)
			{
					status = WriteFlash(Address, (int8_t*)&ucLDR_Message.com_data[2], 64);	
					if(status==FSL_OK)
					{
						Boot_ImageCrc32_Consume(Address, &ucLDR_Message.com_data[2], 64U);
						Address += 64; 
						ucLDR_Message.frame_query_page++;
#ifdef SUPPORT_MCU_QUERY													
						UpdateInfo_TimeOut_Flag=1;
						UpdateInfo_TimeOut_Count=0;
#endif	
						Send_8268k_IAP_Query_Data(DATA_OK); 	
					}
			}	
			else
			{
				Send_8268k_IAP_Query_Data(DATA_OK);
			}
			
		}
	else 
		{
			status = DATA_ERR;
			Send_8268k_IAP_Query_Data(DATA_ERR);
		}

}


void FSL_Reset_Address_For_UDS(void)
{
	Address = FLASH_STATR_AREA;
}

uint8_t FSL_Writer_App_From_UDS(unsigned char *data, unsigned char size)
{
	uint32_t	qw=128;
	uint8_t	status=0;
	uint8_t aligned_size;
	uint8_t write_buf[64];
	if ((data == 0) || (size == 0) || (size > 64))
	{
		return DATA_ERR;
	}

	aligned_size = (uint8_t)((size + 3u) & 0xFCu);
	memset(write_buf, 0xFF, sizeof(write_buf));
	memcpy(write_buf, data, size);

	if ((Address >= FLASH_STATR_AREA) && ((Address + aligned_size - 1U) <= APP_A_END_ADDRESS))
	{
		status = WriteFlash(Address, (int8_t*)write_buf, aligned_size);
		if(status==FSL_OK)
		{
			Boot_ImageCrc32_Consume(Address, data, size);
			Address += aligned_size;
			return DATA_OK;
		}
	}

	return DATA_ERR;
}
#if 0
unsigned long  ReadData[64];

void FSL_Read_App(void)
{
	unsigned long *pdata,i=0;
	pdata=(unsigned long *)0x3fc0;
	for(i=0;i<64;i++)
	{
		ReadData[i]=*(pdata+i);
	}
}

#endif

void Polling_ACC(void)
{
	if((ACC_CHECK_IN==0)&&(flag_acc==0))//ACC Connect
		{
			flag_acc=1;
			Key_Power(1);
		}
      else if((ACC_CHECK_IN)&&(flag_acc==1))//ACC Disconnect
      	{	      		
			flag_acc=0;
			Key_Power(0);
      	}
}


#ifdef SUPPORT_MCU_QUERY	
void Polling_MCU_Upgrade_Query(void)
{

	if(UpdateInfo_TimeOut_Flag)
		{
			UpdateInfo_TimeOut_Count++;
			if(UpdateInfo_TimeOut_Count>50)
			{		
				UpdateInfo_TimeOut_Count=0;
				Send_8268k_IAP_Query_Data(1); 
			}
		}
}
#endif

void IapMain(void)
{
	//unsigned int i=0;

	Address=FLASH_STATR_AREA;	
	//if(CheckRunIap() == 0XBB)

	Send_8268k_IAP_cmd(MCU_TO_ARM_Start,DTA_OK);

	while(1)
	{

		 Polling_ACC(); 	
#ifdef SUPPORT_MCU_QUERY	
		 Polling_MCU_Upgrade_Query();
#endif	  
		  if((Message_Rcv())&&(flag_acc==1))
		  	{
				 switch(ucLDR_Message.protocol_command)
				 	{
	
						case ID_Rev_Linking_Cmd:
							Send_8268k_Version();	
							flag_app_ok=1;			
							break;
						case ID_Rev_Quary_Version_Cmd:
							Send_8268k_Version();			
							break;							
				 		case ID_Rev_Start_upgrade_Cmd:	
							Clear_RAM_upflag();					
							Send_8268k_IAP_cmd(MCU_TO_ARM_Start,DATA_OK);
							Address=FLASH_STATR_AREA;
							Boot_ImageCrc32_Reset();
							ucLDR_Message.msg_total_cks=0;
							break;
						case ID_Rev_Esase_flash_Cmd:
							Clear_RAM_upflag();						
							if(Check_key_code()==DATA_OK)
								{
									if (FSL_Backup_AppToB() != FSL_OK)
									{
										Send_8268k_IAP_cmd(MCU_TO_ARM_CHECK_KEY,AM1_KEY_VERIFY_ERR);
										break;
									}
									Boot_SetRollbackPending();
									FSL_Erase_App();
									FSL_Writer_KeyCode();
									Send_8268k_IAP_cmd(MCU_TO_ARM_CHECK_KEY,AM1_KEY_VERIFY_OK);
									ucLDR_Message.frame_page=0;
							        ucLDR_Message.frame_query_page=1;
								}
							else
								{									
									Send_8268k_IAP_cmd(MCU_TO_ARM_CHECK_KEY,AM1_KEY_VERIFY_ERR);
								}
							break;
						case ID_Rev_Write_flash_Cmd:	
							ucLDR_Message.protocol_command=0;
							FSL_Writer_App();							
							break;
						case ID_Rev_Write_Complete_Cmd:
#ifdef SUPPORT_MCU_QUERY							
							UpdateInfo_TimeOut_Flag=0;
							UpdateInfo_TimeOut_Count=0;
#endif							
							ucLDR_Message.protocol_command=0;	
							if(Boot_ImageCrc32_IsValid() != 0U)
							{
							
								Send_8268k_IAP_cmd(MCU_TO_ARM_COMPLETE,DATA_OK);
#ifdef SUPPORT_CHECKSUM_IN_DATAFLASH							
								Clear_RunIap();
						//      Write_Iap_Complete();
#endif						
                                DI();
								Key_Power(0);
								WaitTime(20);			
								FSL_ForceReset();
								break;

							}
							Send_8268k_IAP_cmd(MCU_TO_ARM_COMPLETE,DATA_ERR);
							break;	
						default:
							break;
				 	}
				
		  	}
	}

}

/* End user code. Do not edit comment generated here */



